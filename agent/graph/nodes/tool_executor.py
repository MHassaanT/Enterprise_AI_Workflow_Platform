"""
Tool Executor Node — validates and executes MCP tools.

Three-stage execution per spec (section 13.3):
  1. ToolBinding allowlist check — agent can only call its permitted tools
  2. Pydantic parameter validation — rejects malformed/injected arguments
  3. Execution + audit log write
"""
from langchain_core.messages import ToolMessage
from pydantic import ValidationError
from graph.state import AgentState
from tool_gateway.registry import TOOL_REGISTRY, TOOL_INPUT_MODELS, get_allowed_tools
from services.db_client import write_audit_log


async def tool_executor_node(state: AgentState) -> dict:
    tool_call = state["pending_tool_call"]
    tool_name = tool_call["name"]
    arguments = tool_call.get("arguments", {})
    # Use the LLM-generated call ID so ToolMessage matches the preceding AI message
    tool_call_id = tool_call.get("id", tool_name)

    # ── Stage 1: ToolBinding allowlist ──
    allowed = await get_allowed_tools(state["agent_instance_id"])
    if tool_name not in allowed:
        msg = f"Tool '{tool_name}' is not authorized for this agent."
        return _error(tool_call_id, msg)

    if tool_name not in TOOL_REGISTRY:
        msg = f"Tool '{tool_name}' is not registered."
        return _error(tool_call_id, msg)

    # ── Stage 2: Pydantic parameter validation ──
    InputModel = TOOL_INPUT_MODELS.get(tool_name)
    if InputModel:
        try:
            validated = InputModel(**arguments)
            arguments = validated.model_dump()
        except ValidationError as e:
            msg = f"Invalid parameters for '{tool_name}': {e}"
            return _error(tool_call_id, msg)

    # ── Stage 3: Execute + audit ──
    try:
        tool_fn = TOOL_REGISTRY[tool_name]
        result = await tool_fn(**arguments)
        result_str = str(result)

        await write_audit_log(
            state["tenant_id"],
            "tool_executed",
            {
                "toolName": tool_name,
                "arguments": arguments,
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
