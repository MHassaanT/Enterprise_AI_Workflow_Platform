"""
MCP Tool Registry

Central registry mapping tool names to:
  - async callables (TOOL_REGISTRY)
  - Pydantic input models for validation (TOOL_INPUT_MODELS)
  - LangChain StructuredTool objects for LLM binding (LANGCHAIN_TOOLS)
  - Dynamic MCP connector tool generator via Postgres ToolBinding allowlist per agent_instance_id
"""
from typing import Callable, List, Dict, Any
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, create_model

from tool_gateway.tools.check_order_status import check_order_status_impl, CheckOrderStatusInput
from tool_gateway.tools.escalate_to_human import escalate_to_human_impl, EscalateToHumanInput
from tool_gateway.mcp_client import execute_remote_mcp_tool
from services.db_client import get_agent_tool_bindings

# ── Core built-in registries ──

TOOL_REGISTRY: Dict[str, Callable] = {
    "check_order_status": check_order_status_impl,
    "escalate_to_human": escalate_to_human_impl,
}

TOOL_INPUT_MODELS: Dict[str, type] = {
    "check_order_status": CheckOrderStatusInput,
    "escalate_to_human": EscalateToHumanInput,
}

BUILTIN_LANGCHAIN_TOOLS: Dict[str, StructuredTool] = {
    "check_order_status": StructuredTool.from_function(
        coroutine=check_order_status_impl,
        name="check_order_status",
        description=(
            "Returns the current status of a customer order. "
            "Use this when the user asks about their order, delivery, shipment, or tracking."
        ),
        args_schema=CheckOrderStatusInput,
    ),
    "escalate_to_human": StructuredTool.from_function(
        coroutine=escalate_to_human_impl,
        name="escalate_to_human",
        description=(
            "Escalates an issue or high-risk action to a human supervisor for approval. "
            "Use when an ungrounded inquiry cannot be answered accurately from documents, "
            "or when an irreversible/high-risk action (such as refunds or credits) is requested."
        ),
        args_schema=EscalateToHumanInput,
    ),
}

# ── Dynamic Allowlist & MCP Tool Resolution ──

async def get_allowed_tool_bindings(agent_instance_id: str) -> List[Dict[str, Any]]:
    """
    Queries Postgres via backend internal API to retrieve the explicit ToolBinding records
    for this specific agent_instance_id.
    """
    result = await get_agent_tool_bindings(agent_instance_id)
    return result.get("tools", [])


async def get_allowed_tools(agent_instance_id: str) -> List[str]:
    """Returns list of tool names allowed for this agent."""
    bindings = await get_allowed_tool_bindings(agent_instance_id)
    return [b["tool_name"] for b in bindings]


async def get_tools_for_agent(agent_instance_id: str) -> List[StructuredTool]:
    """
    Generates and returns LangChain StructuredTool objects for binding to the LLM,
    strictly restricted to the agent's ToolBinding allowlist.
    """
    bindings = await get_allowed_tool_bindings(agent_instance_id)
    tools: List[StructuredTool] = []

    for binding in bindings:
        tool_name = binding.get("tool_name")
        connector_type = binding.get("connector_type", "builtin")

        # 1. Check if it's a built-in platform tool
        if connector_type == "builtin" and tool_name in BUILTIN_LANGCHAIN_TOOLS:
            tools.append(BUILTIN_LANGCHAIN_TOOLS[tool_name])
            continue

        # 2. Dynamic MCP / Vendor Adapter tool
        tenant_id = binding.get("tenant_id", "")
        config = binding.get("config") or {}
        description = config.get("description") or f"Execute {tool_name} tool via Centralized Integration Gateway."

        async def _mcp_executor(tn=tool_name, tid=tenant_id, aid=agent_instance_id, **kwargs):
            from tool_gateway.centralized_gateway import execute_mcp_tool
            return await execute_mcp_tool(
                tenant_id=tid,
                agent_instance_id=aid,
                tool_name=tn,
                arguments=kwargs,
            )

        mcp_tool = StructuredTool.from_function(
            coroutine=_mcp_executor,
            name=tool_name,
            description=description,
        )
        tools.append(mcp_tool)

    return tools
