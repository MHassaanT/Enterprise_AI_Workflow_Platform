"""
MCP Tool Registry

Central registry mapping tool names to:
  - async callables (TOOL_REGISTRY)
  - Pydantic input models for validation (TOOL_INPUT_MODELS)
  - LangChain StructuredTool objects for LLM binding (LANGCHAIN_TOOLS)

Phase 3: All agents get all tools (allowlist = full registry).
Phase 4: get_allowed_tools() will query Postgres ToolBinding table per agent_instance_id.
"""
from typing import Callable
from langchain_core.tools import StructuredTool

from tool_gateway.tools.check_order_status import check_order_status_impl, CheckOrderStatusInput
from tool_gateway.tools.escalate_to_human import escalate_to_human_impl, EscalateToHumanInput

# ── Core registries ──

TOOL_REGISTRY: dict[str, Callable] = {
    "check_order_status": check_order_status_impl,
    "escalate_to_human": escalate_to_human_impl,
}

TOOL_INPUT_MODELS: dict[str, type] = {
    "check_order_status": CheckOrderStatusInput,
    "escalate_to_human": EscalateToHumanInput,
}

# ── LangChain tool objects — bound to LLM via llm.bind_tools() ──

LANGCHAIN_TOOLS: list[StructuredTool] = [
    StructuredTool.from_function(
        coroutine=check_order_status_impl,
        name="check_order_status",
        description=(
            "Returns the current status of a customer order. "
            "Use this when the user asks about their order, delivery, shipment, or tracking."
        ),
        args_schema=CheckOrderStatusInput,
    ),
    StructuredTool.from_function(
        coroutine=escalate_to_human_impl,
        name="escalate_to_human",
        description=(
            "Escalates a customer issue to a human agent or supervisor. "
            "Use when you cannot resolve the issue, when a refund or credit is requested, "
            "or when the customer is upset and requires human attention."
        ),
        args_schema=EscalateToHumanInput,
    ),
]

# ── Allowlist helpers ──

async def get_allowed_tools(agent_instance_id: str) -> list[str]:
    """
    Returns the list of tool names this agent is permitted to call.
    Phase 3: returns all registered tools.
    Phase 4: query Postgres ToolBinding table WHERE agent_id = agent_instance_id.
    """
    return list(TOOL_REGISTRY.keys())


async def get_tools_for_agent(agent_instance_id: str) -> list[StructuredTool]:
    """Returns LangChain StructuredTool objects for binding to the LLM."""
    allowed = await get_allowed_tools(agent_instance_id)
    return [t for t in LANGCHAIN_TOOLS if t.name in allowed]
