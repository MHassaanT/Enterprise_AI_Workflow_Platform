"""
Tool Executor Node — validates and executes built-in and dynamic MCP tools.

Three-stage execution per spec:
  1. ToolBinding allowlist check — agent can only call its explicitly bound tools
  2. Parameter validation — verifies input parameters against Pydantic models or tool schemas
  3. Execution + audit log write
"""
from langchain_core.messages import ToolMessage
from pydantic import ValidationError
from graph.state import AgentState
from tool_gateway.registry import TOOL_REGISTRY, TOOL_INPUT_MODELS, get_allowed_tool_bindings
from tool_gateway.mcp_client import execute_remote_mcp_tool
from services.db_client import write_audit_log


async def tool_executor_node(state: AgentState) -> dict:
    tool_call = state["pending_tool_call"]
    tool_name = tool_call["name"]
    arguments = tool_call.get("arguments", {})
    tool_call_id = tool_call.get("id", tool_name)

    # ── Stage 1: ToolBinding allowlist check ──
    bindings = await get_allowed_tool_bindings(state["agent_instance_id"])
    target_binding = next((b for b in bindings if b["tool_name"] == tool_name), None)

    if not target_binding:
        msg = f"Security Error: Tool '{tool_name}' is not authorized for this agent instance."
        return _error(tool_call_id, msg)

    # ── Stage 2: Parameter validation ──
    InputModel = TOOL_INPUT_MODELS.get(tool_name)
    if InputModel:
        try:
            validated = InputModel(**arguments)
            arguments = validated.model_dump()
        except ValidationError as e:
            msg = f"Invalid parameters for '{tool_name}': {e}"
            return _error(tool_call_id, msg)

    # ── Stage 3: Execution + audit ──
    try:
        connector_type = target_binding.get("connector_type", "builtin")

        if connector_type == "builtin" and tool_name in TOOL_REGISTRY:
            tool_fn = TOOL_REGISTRY[tool_name]
            result = await tool_fn(**arguments)
            result_str = str(result)
        else:
            # Remote MCP Execution
            endpoint_url = target_binding.get("endpoint_url")
            auth_headers = target_binding.get("auth_headers") or {}
            result_str = await execute_remote_mcp_tool(
                endpoint_url=endpoint_url,
                tool_name=tool_name,
                arguments=arguments,
                auth_headers=auth_headers,
                transport_type=connector_type,
            )

        await write_audit_log(
            state["tenant_id"],
            "tool_executed",
            {
                "toolName": tool_name,
                "arguments": arguments,
                "connectorType": connector_type,
                "result": result_str[:500],
                "conversationId": state["conversation_id"],
                "userId": state["user_id"],
            },
        )

        return {
            "messages": [ToolMessage(content=result_str, tool_call_id=tool_call_id)],
            "tool_result": result_str,
            "next_step": "",
            "pending_tool_call": None,
        }

    except Exception as e:
        msg = f"Tool '{tool_name}' execution failed: {e}"
        return _error(tool_call_id, msg)


def _error(tool_call_id: str, message: str) -> dict:
    return {
        "messages": [ToolMessage(content=message, tool_call_id=tool_call_id)],
        "tool_result": message,
        "next_step": "",
        "pending_tool_call": None,
    }
