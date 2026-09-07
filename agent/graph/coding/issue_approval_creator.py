"""
Issue Approval Creator Node — creates a human approval request with investigation findings.

After the issue_investigator completes its analysis, this node creates an approval_request
record so human reviewers can review the Coding Agent's findings and decide next steps.
"""

import json
from typing import Dict, Any
from graph.coding.state import CodingAgentState
from services.db_client import create_approval_request, update_issue_investigation, write_audit_log


async def issue_approval_creator_node(state: CodingAgentState) -> Dict[str, Any]:
    """Create a human approval request with the investigation findings."""
    
    issue_id = state.get("issue_id", "")
    issue_title = state.get("issue_title", "")
    tenant_id = state.get("tenant_id", "")
    investigation_findings = state.get("investigation_findings", "")
    root_cause = state.get("root_cause", "")
    investigated_files = state.get("investigated_files", [])
    
    print(f"[ISSUE APPROVAL CREATOR] Creating approval for issue {issue_id}: {issue_title}")
    
    # Build the approval payload with full investigation details
    approval_payload = {
        "issue_id": issue_id,
        "issue_title": issue_title,
        "issue_description": state.get("issue_description", ""),
        "customer_message": state.get("issue_customer_message", ""),
        "investigation_repo": state.get("repo", ""),
        "investigation_branch": state.get("base_branch", "main"),
        "root_cause": root_cause,
        "investigation_findings": investigation_findings,
        "investigated_files": investigated_files,
    }
    
    try:
        approval_id = await create_approval_request({
            "tenantId": tenant_id,
            "conversationId": None,
            "actionType": "issue_investigation_review",
            "actionPayload": approval_payload,
        })
        
        print(f"[ISSUE APPROVAL CREATOR] Approval created: {approval_id}")
        
        # Link approval to the reported issue and update status
        await update_issue_investigation(issue_id, {
            "tenantId": tenant_id,
            "status": "awaiting_review",
            "approvalId": approval_id,
        })
        
        # Write audit log
        await write_audit_log(
            tenant_id,
            "issue_investigation_approval_created",
            {
                "issueId": issue_id,
                "approvalId": approval_id,
                "rootCause": root_cause[:200] if root_cause else "",
                "issueTitle": issue_title,
            },
        )
        
        return {
            "investigation_approval_id": approval_id,
            "status": "awaiting_review",
            "messages": state.get("messages", []) + [{
                "role": "assistant",
                "content": (
                    f"Investigation for issue '{issue_title}' is complete. "
                    f"An approval request has been created for human review (ID: {approval_id[:8]}). "
                    f"Root cause assessment: {root_cause[:200]}"
                ),
            }],
        }
        
    except Exception as e:
        print(f"[ISSUE APPROVAL CREATOR] Error creating approval: {e}")
        # Still update the issue status even if approval creation fails
        try:
            await update_issue_investigation(issue_id, {
                "tenantId": tenant_id,
                "status": "awaiting_review",
                "investigationFindings": (investigation_findings or "") + f"\n\nNote: Approval creation failed: {str(e)}",
            })
        except Exception:
            pass
        
        return {
            "status": "error",
            "error_message": f"Failed to create approval: {str(e)}",
            "messages": state.get("messages", []) + [{
                "role": "assistant",
                "content": f"Investigation completed but failed to create approval: {str(e)}",
            }],
        }
