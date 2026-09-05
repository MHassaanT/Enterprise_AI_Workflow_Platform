"""
Approval Checkpoint Node — pauses the graph for high-risk actions.

Writes a pending ApprovalRequest to Postgres (via Node.js internal route),
notifies the reviewer dashboard, and appends a user-facing pending message.

Graph resumes via POST /agent/resume when a reviewer approves/rejects.
"""
from langchain_core.messages import AIMessage, ToolMessage
from graph.state import AgentState
from services.db_client import create_approval_request, write_audit_log


async def approval_checkpoint_node(state: AgentState) -> dict:
    calls = state.get("pending_tool_calls")
    if not calls:
        single = state.get("pending_tool_call")
        calls = [single] if single else []

    if not calls:
        return {"next_step": "", "approval_status": "pending"}

    primary_call = calls[0]
    action_payload = primary_call.get("arguments", {})

    # Write ApprovalRequest to Postgres via Node.js internal route
    approval_id = await create_approval_request({
        "tenantId": state.get("tenant_id") or "",
        "agentInstanceId": state.get("agent_instance_id") or "default",
        "conversationId": state.get("conversation_id") or "",
        "actionType": primary_call["name"],
        "actionPayload": action_payload,
    })

    # Audit log (required per spec section 13.4)
    await write_audit_log(
        state["tenant_id"],
        "approval_requested",
        {
            "approvalId": approval_id,
            "actionType": primary_call["name"],
            "conversationId": state["conversation_id"],
            "userId": state["user_id"],
        },
    )

    # Inform the user that a reviewer has been notified for all pending calls
    pending_messages = [
        ToolMessage(
            content=(
                f"This action requires approval from a human reviewer before it can proceed. "
                f"A reviewer has been notified and will respond shortly. "
                f"(Reference ID: {approval_id})"
            ),
            tool_call_id=call["id"],
            name=call["name"],
        )
        for call in calls
    ]

    return {
        "messages": pending_messages,
        "approval_id": approval_id,
        "approval_status": "pending",
        "next_step": "",
    }

