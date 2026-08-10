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
from tool_gateway.tools.submit_refund_request import submit_refund_request_impl, SubmitRefundRequestInput
from tool_gateway.mcp_client import execute_remote_mcp_tool
from services.db_client import get_agent_tool_bindings

# ── Core built-in registries ──

_check_order_desc = (
    "Returns the current status of a customer order by order_id or email address. "
    "Use this when the user asks about their order status, shipment, delivery, or order details."
)

_escalate_desc = (
    "Escalates an issue or high-risk action to a human supervisor for approval. "
    "Use when an ungrounded inquiry cannot be answered accurately from documents, "
    "or when an irreversible/high-risk action (such as refunds or credits) is requested."
)

_escalate_desc = (
    "Escalates an issue or high-risk action to a human supervisor for approval. "
    "Use when an ungrounded inquiry cannot be answered accurately from documents, "
    "or when an irreversible/high-risk action (such as refunds or credits) is requested."
)

_submit_refund_desc = (
    "Submits a refund request for an order. "
    "This is a high-risk tool and will require human approval. "
    "You MUST gather the customer's confirmed name, email, the refund reason, and the order details from check_order_status before calling this."
)

TOOL_REGISTRY: Dict[str, Callable] = {
    "check_order_status": check_order_status_impl,
    "check_order_details": check_order_status_impl,
    "check_order": check_order_status_impl,
    "order_status": check_order_status_impl,
    "escalate_to_human": escalate_to_human_impl,
    "human_escalation": escalate_to_human_impl,
    "escalate": escalate_to_human_impl,
    "submit_refund_request": submit_refund_request_impl,
}

TOOL_INPUT_MODELS: Dict[str, type] = {
    "check_order_status": CheckOrderStatusInput,
    "check_order_details": CheckOrderStatusInput,
    "check_order": CheckOrderStatusInput,
    "order_status": CheckOrderStatusInput,
    "escalate_to_human": EscalateToHumanInput,
    "human_escalation": EscalateToHumanInput,
    "escalate": EscalateToHumanInput,
    "submit_refund_request": SubmitRefundRequestInput,
}

BUILTIN_LANGCHAIN_TOOLS: Dict[str, StructuredTool] = {
    "check_order_status": StructuredTool.from_function(
        coroutine=check_order_status_impl,
        name="check_order_status",
        description=_check_order_desc,
        args_schema=CheckOrderStatusInput,
    ),
    "check_order_details": StructuredTool.from_function(
        coroutine=check_order_status_impl,
        name="check_order_details",
        description=_check_order_desc,
        args_schema=CheckOrderStatusInput,
    ),
    "check_order": StructuredTool.from_function(
        coroutine=check_order_status_impl,
        name="check_order",
        description=_check_order_desc,
        args_schema=CheckOrderStatusInput,
    ),
    "order_status": StructuredTool.from_function(
        coroutine=check_order_status_impl,
        name="order_status",
        description=_check_order_desc,
        args_schema=CheckOrderStatusInput,
    ),
    "escalate_to_human": StructuredTool.from_function(
        coroutine=escalate_to_human_impl,
        name="escalate_to_human",
        description=_escalate_desc,
        args_schema=EscalateToHumanInput,
    ),
    "human_escalation": StructuredTool.from_function(
        coroutine=escalate_to_human_impl,
        name="human_escalation",
        description=_escalate_desc,
        args_schema=EscalateToHumanInput,
    ),
    "escalate": StructuredTool.from_function(
        coroutine=escalate_to_human_impl,
        name="escalate",
        description=_escalate_desc,
        args_schema=EscalateToHumanInput,
    ),
    "submit_refund_request": StructuredTool.from_function(
        coroutine=submit_refund_request_impl,
        name="submit_refund_request",
        description=_submit_refund_desc,
        args_schema=SubmitRefundRequestInput,
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


def _build_dynamic_schema(tool_name: str, config: Dict[str, Any]) -> type:
    """
    Builds a Pydantic model from the tool binding's config.parameters so the LLM
    receives a proper JSON schema with user-facing field names and descriptions.

    Supports two config shapes:
      - config.parameters = {"order_id": {"description": "...", "type": "string"}, ...}
      - config.parameters = [{"name": "order_id", "description": "...", "type": "string"}, ...]
    Falls back to a single generic 'query' field if no parameters are defined.
    """
    if "gmail" in tool_name.lower():
        class GmailDynamicInput(BaseModel):
            action: str = Field(description="The action to perform (e.g. 'gmail_send_email')")
            to: str = Field(description="Recipient email address (required for sending)")
            subject: str = Field(description="Email subject")
            body: str = Field(description="Email body text")
            q: str = Field(default="", description="Search query")
            limit: int = Field(default=10, description="Max results")
        return GmailDynamicInput
    elif "google_doc" in tool_name.lower() or "docs" in tool_name.lower():
        class GoogleDocsDynamicInput(BaseModel):
            action: str = Field(description="Action to perform: 'read_document', 'append_text', or 'create_document'")
            document_id: str = Field(default=None, description="Google Document ID")
            text: str = Field(default=None, description="Text content to append")
            title: str = Field(default=None, description="Title for new document")
        return GoogleDocsDynamicInput
    elif "google_sheet" in tool_name.lower() or "sheets" in tool_name.lower():
        class GoogleSheetsDynamicInput(BaseModel):
            action: str = Field(description="Action to perform: 'read_range', 'update_rows', or 'create_spreadsheet'")
            spreadsheet_id: str = Field(default=None, description="Google Spreadsheet ID")
            range: str = Field(default=None, description="Cell range in A1 notation (e.g. Sheet1!A1:B10)")
            values: Any = Field(default=None, description="Values/rows data (2D array)")
            title: str = Field(default=None, description="Title for new spreadsheet")
        return GoogleSheetsDynamicInput

    params_raw = config.get("parameters") or config.get("params") or {}

    field_definitions: Dict[str, Any] = {}

    if isinstance(params_raw, dict):
        for param_name, param_info in params_raw.items():
            desc = param_info.get("description", "") if isinstance(param_info, dict) else str(param_info)
            required = param_info.get("required", False) if isinstance(param_info, dict) else False
            if required:
                field_definitions[param_name] = (str, Field(description=desc))
            else:
                field_definitions[param_name] = (str, Field(default=None, description=desc))
    elif isinstance(params_raw, list):
        for param_info in params_raw:
            if isinstance(param_info, dict):
                param_name = param_info.get("name", "input")
                desc = param_info.get("description", "")
                required = param_info.get("required", False)
                if required:
                    field_definitions[param_name] = (str, Field(description=desc))
                else:
                    field_definitions[param_name] = (str, Field(default=None, description=desc))

    # Fallback: if no parameters were defined, provide a generic 'query' field
    if not field_definitions:
        field_definitions["query"] = (
            str,
            Field(description="The query, identifier, or search term to pass to the tool"),
        )

    # Sanitize tool name to be a valid Python class identifier
    safe_name = "".join(c if c.isalnum() else "_" for c in tool_name).strip("_") or "DynamicTool"
    return create_model(f"{safe_name}_Input", **field_definitions)


def _make_mcp_executor(tool_name: str, tenant_id: str, agent_instance_id: str):
    """
    Factory that returns a clean async callable whose signature is just **kwargs.
    Internal routing variables (tool_name, tenant_id, agent_instance_id) are captured
    in the closure scope and never exposed in the function signature, so
    StructuredTool.from_function won't leak them into the LLM's tool schema.
    """
    async def executor(**kwargs):
        from tool_gateway.centralized_gateway import execute_mcp_tool
        return await execute_mcp_tool(
            tenant_id=tenant_id,
            agent_instance_id=agent_instance_id,
            tool_name=tool_name,
            arguments=kwargs,
        )
    return executor


async def get_tools_for_agent(agent_instance_id: str) -> List[StructuredTool]:
    """
    Generates and returns LangChain StructuredTool objects for binding to the LLM,
    strictly restricted to the agent's ToolBinding allowlist.
    """
    bindings = await get_allowed_tool_bindings(agent_instance_id)
    tools: List[StructuredTool] = []

    for binding in bindings:
        tool_name = binding.get("tool_name", "")
        connector_type = (binding.get("connector_type") or binding.get("provider_type") or "builtin").lower()
        norm_name = tool_name.lower().replace("-", "_").replace(" ", "_")

        # 1. Check if it's a built-in platform tool (direct match or alias)
        if connector_type == "builtin" or norm_name in BUILTIN_LANGCHAIN_TOOLS or "order" in norm_name or "escalat" in norm_name:
            if norm_name in BUILTIN_LANGCHAIN_TOOLS:
                tools.append(BUILTIN_LANGCHAIN_TOOLS[norm_name])
                continue
            elif "order" in norm_name:
                tools.append(StructuredTool.from_function(
                    coroutine=check_order_status_impl,
                    name=tool_name,
                    description=_check_order_desc,
                    args_schema=CheckOrderStatusInput,
                ))
                continue
            elif "escalat" in norm_name:
                tools.append(StructuredTool.from_function(
                    coroutine=escalate_to_human_impl,
                    name=tool_name,
                    description=_escalate_desc,
                    args_schema=EscalateToHumanInput,
                ))
                continue

        # 2. Dynamic MCP / Vendor Adapter tool
        tenant_id = binding.get("tenant_id", "")
        config = binding.get("config") or {}
        description = config.get("description") or f"Execute {tool_name} tool via Centralized Integration Gateway."

        # Build a proper args_schema from binding config so the LLM sees
        # real user-facing parameters instead of internal routing args.
        input_schema = _build_dynamic_schema(tool_name, config)

        # Factory function isolates internal routing vars from the tool's
        # public signature — the LLM only sees args_schema fields.
        executor = _make_mcp_executor(tool_name, tenant_id, agent_instance_id)

        mcp_tool = StructuredTool.from_function(
            coroutine=executor,
            name=tool_name,
            description=description,
            args_schema=input_schema,
        )
        tools.append(mcp_tool)

    return tools
