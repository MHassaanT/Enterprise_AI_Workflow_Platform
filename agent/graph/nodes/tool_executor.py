"""
Tool Executor Node — delegates tool execution to Centralized MCP Gateway
and logs tenant-scoped audit records.
"""
from langchain_core.messages import ToolMessage
from pydantic import ValidationError
from graph.state import AgentState
from tool_gateway.registry import TOOL_INPUT_MODELS
from tool_gateway.centralized_gateway import execute_mcp_tool
from services.db_client import write_audit_log


async def tool_executor_node(state: AgentState) -> dict:
    tool_call = state["pending_tool_call"]
    tool_name = tool_call["name"]
    arguments = tool_call.get("arguments", {})
    tool_call_id = tool_call.get("id", tool_name)
    tenant_id = state["tenant_id"]
    agent_instance_id = state["agent_instance_id"]

    # ── Stage 1: Optional Pydantic parameter validation ──
    InputModel = TOOL_INPUT_MODELS.get(tool_name)
    if InputModel:
        try:
            validated = InputModel(**arguments)
            arguments = validated.model_dump()
        except ValidationError as e:
            msg = f"Invalid parameters for '{tool_name}': {e}"
            return _error(tool_call_id, msg)

    # ── Stage 2: Centralized Gateway Execution ──
    try:
        result_str = await execute_mcp_tool(
            tenant_id=tenant_id,
            agent_instance_id=agent_instance_id,
            tool_name=tool_name,
            arguments=arguments,
        )

        # ── Stage 3: Tenant-Scoped Audit Logging ──
        await write_audit_log(
            tenant_id,
            "tool_executed",
            {
                "toolName": tool_name,
                "arguments": arguments,
                "result": result_str[:500],
                "conversationId": state["conversation_id"],
                "userId": state.get("user_id", "anonymous"),
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
