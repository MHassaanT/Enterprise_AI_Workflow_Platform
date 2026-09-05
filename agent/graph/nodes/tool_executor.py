"""
Tool Executor Node — delegates tool execution to Centralized MCP Gateway
and logs tenant-scoped audit records.
"""
from langchain_core.messages import ToolMessage
from pydantic import ValidationError
from graph.state import AgentState
from tool_gateway.registry import TOOL_INPUT_MODELS, TOOL_REGISTRY
from tool_gateway.centralized_gateway import execute_mcp_tool
from services.db_client import write_audit_log


async def tool_executor_node(state: AgentState) -> dict:
    # Support both parallel tool calls (pending_tool_calls) and single tool call (pending_tool_call)
    calls = state.get("pending_tool_calls")
    if not calls:
        single = state.get("pending_tool_call")
        calls = [single] if single else []

    if not calls:
        return {
            "messages": [],
            "next_step": "",
            "pending_tool_call": None,
            "pending_tool_calls": None,
        }

    tenant_id = state.get("tenant_id") or ""
    agent_instance_id = state.get("agent_instance_id") or "default"
    current_retries = state.get("tool_retry_count", 0)

    tool_messages = []
    has_error = False
    last_result_str = ""

    for call in calls:
        tool_name = call["name"]
        arguments = call.get("arguments", {})
        tool_call_id = call.get("id", tool_name)

        # ── Stage 1: Optional Pydantic parameter validation ──
        InputModel = TOOL_INPUT_MODELS.get(tool_name)
        if InputModel:
            try:
                validated = InputModel(**arguments)
                arguments = validated.model_dump()
            except ValidationError as e:
                msg = f"Invalid parameters for '{tool_name}': {e}"
                tool_messages.append(ToolMessage(content=msg, tool_call_id=tool_call_id))
                has_error = True
                continue

        # ── Stage 2: Centralized Gateway Execution ──
        try:
            result_str = await execute_mcp_tool(
                tenant_id=tenant_id,
                agent_instance_id=agent_instance_id,
                tool_name=tool_name,
                arguments=arguments,
                conversation_id=state.get("conversation_id", ""),
            )
            print(f"[TOOL EXECUTOR] Executed '{tool_name}' (id={tool_call_id}) with args {arguments} | Result: {result_str}")
            last_result_str = result_str

            is_error_result = any(
                result_str.startswith(prefix)
                for prefix in ["Error", "Security Error:", "Tool '", "Gmail API Error"]
            )
            if is_error_result:
                has_error = True

            # ── Stage 3: Tenant-Scoped Audit Logging ──
            await write_audit_log(
                tenant_id,
                "tool_executed",
                {
                    "toolName": tool_name,
                    "arguments": arguments,
                    "result": result_str[:500],
                    "conversationId": state.get("conversation_id", ""),
                    "userId": state.get("user_id", "anonymous"),
                },
            )

            tool_messages.append(ToolMessage(content=result_str, tool_call_id=tool_call_id))

        except Exception as e:
            msg = f"Tool '{tool_name}' execution failed: {e}"
            print(f"[TOOL EXECUTOR ERROR] {msg}")
            has_error = True
            tool_messages.append(ToolMessage(content=msg, tool_call_id=tool_call_id))

    return {
        "messages": tool_messages,
        "tool_result": last_result_str,
        "next_step": "",
        "pending_tool_call": None,
        "pending_tool_calls": None,
        "tool_retry_count": (current_retries + 1) if has_error else 0,
    }

