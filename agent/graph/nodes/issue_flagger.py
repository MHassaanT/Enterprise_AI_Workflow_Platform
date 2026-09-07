"""
Issue Flagger Node — flags unresolvable customer issues for cross-agent investigation.

When the reasoning node determines it cannot resolve a customer's complaint from
the knowledge base or database, this node:
1. Creates a reported_issue record via the Node.js backend
2. Logs an audit entry
3. Notifies the customer that the issue has been escalated
"""
from langchain_core.messages import AIMessage
from graph.state import AgentState
from services.db_client import create_reported_issue, write_audit_log


async def issue_flagger_node(state: AgentState) -> dict:
    """Flag an unresolvable customer issue for Coding Agent investigation and human review."""
    
    flagged_issue = state.get("flagged_issue")
    if not flagged_issue:
        print("[ISSUE FLAGGER] No flagged issue data found, skipping.")
        return {}
    
    tenant_id = state.get("tenant_id", "")
    conversation_id = state.get("conversation_id", "")
    
    try:
        issue_id = await create_reported_issue({
            "tenantId": tenant_id,
            "conversationId": conversation_id,
            "title": flagged_issue.get("title", "Customer reported issue"),
            "description": flagged_issue.get("description", ""),
            "customerMessage": flagged_issue.get("customer_message", ""),
            "category": flagged_issue.get("category", "unknown"),
            "severity": flagged_issue.get("severity", "medium"),
        })
        
        print(f"[ISSUE FLAGGER] Reported issue created: {issue_id} for tenant={tenant_id}")
        
        # Write audit log
        await write_audit_log(
            tenant_id,
            "customer_issue_flagged",
            {
                "issueId": issue_id,
                "conversationId": conversation_id,
                "title": flagged_issue.get("title"),
                "category": flagged_issue.get("category"),
                "severity": flagged_issue.get("severity"),
            },
        )
        
        # Append a notification message to inform the customer
        escalation_msg = AIMessage(content=(
            "I've flagged this issue for our technical team to investigate. "
            "They will analyze the system to identify the root cause and work on a resolution. "
            f"Your issue reference ID is: {issue_id[:8]}. "
            "A team member will review the findings and follow up with you."
        ))
        
        return {
            "messages": [escalation_msg],
            "flagged_issue": {**flagged_issue, "issue_id": issue_id},
        }
        
    except Exception as e:
        print(f"[ISSUE FLAGGER] Error creating reported issue: {e}")
        # Don't break the agent flow — just log and continue
        return {}
