"""
Approval Checkpoint Node — pauses the graph for high-risk actions.

Writes a pending ApprovalRequest to Postgres (via Node.js internal route),
notifies the reviewer dashboard, and appends a user-facing pending message.

Graph resumes via POST /agent/resume when a reviewer approves/rejects.
"""
from langchain_core.messages import AIMessage
from graph.state import AgentState
from services.db_client import create_approval_request, write_audit_log


async def approval_checkpoint_node(state: AgentState) -> dict:
    tool_call = state["pending_tool_call"]

    action_payload = tool_call.get("arguments", {})
    if tool_call["name"] == "submit_refund_request":
        action_payload = {
            "userName": action_payload.get("customer_name", ""),
            "userEmail": action_payload.get("customer_email", ""),
            "orderDetails": action_payload.get("order_details", ""),
            "userRequest": action_payload.get("refund_reason", ""),
            "orderId": action_payload.get("order_id", ""),
            **action_payload
        }

    # Write ApprovalRequest to Postgres via Node.js internal route
    approval_id = await create_approval_request({
        "tenantId": state["tenant_id"],
        "agentInstanceId": state["agent_instance_id"],
        "conversationId": state["conversation_id"],
        "actionType": tool_call["name"],
        "actionPayload": action_payload,
    })

    # Audit log (required per spec section 13.4)
    await write_audit_log(
        state["tenant_id"],
        "approval_requested",
        {
            "approvalId": approval_id,
            "actionType": tool_call["name"],
            "conversationId": state["conversation_id"],
            "userId": state["user_id"],
        },
    )

    # Inform the user that a reviewer has been notified
    pending_msg = AIMessage(
        content=(
            f"This action requires approval from a human reviewer before it can proceed. "
            f"A reviewer has been notified and will respond shortly. "
            f"(Reference ID: {approval_id})"
        )
    )

    return {
        "messages": [pending_msg],
        "approval_id": approval_id,
        "approval_status": "pending",
        "next_step": "",
    }
