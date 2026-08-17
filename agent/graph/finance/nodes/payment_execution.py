"""
Finance Sub-Agent 3: Payment Execution & Ledger Sub-Agent
"""
from typing import Dict, Any
import json
from graph.finance.state import FinanceAgentState
from tool_gateway.finance_mcp import execute_payment_impl
from services.db_client import execute_db_query

async def payment_execution_node(state: FinanceAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    appr_status = state.get("approval_status")
    appr_id = state.get("approval_id")
    inv = state.get("invoice_data") or {}
    
    if appr_status != "approved":
        return {
            "answer": f"Payment execution aborted. Approval status: {appr_status or 'rejected'}.",
            "payment_result": {"status": "aborted", "reason": appr_status}
        }
        
    inv_num = inv.get("invoice_number", "INV-EXEC")
    po_num = state.get("po_number") or inv.get("po_number", "PO-EXEC")
    amount = float(inv.get("total_amount", 0.0))
    vendor_email = inv.get("vendor_email", "vendor@example.com")
    
    # 1. Invoke execute_payment tool via MCP
    exec_res = await execute_payment_impl(inv_num, po_num, amount, vendor_email, tenant_id)
    
    # 2. Update ApprovalRequest status to Resolved
    if appr_id:
        query_appr = "UPDATE approval_requests SET status = 'resolved', updated_at = NOW() WHERE id = $1 AND tenant_id = $2;"
        await execute_db_query(query_appr, [appr_id, tenant_id])
        
    # 3. Write final AuditLogEntry
    query_audit = """
    INSERT INTO audit_logs (tenant_id, agent_name, subagent_name, action, details, reasoning)
    VALUES ($1, 'FinanceAgent', 'payment_execution_subagent', 'PAYMENT_EXECUTED', $2, $3);
    """
    await execute_db_query(query_audit, [
        tenant_id, json.dumps(exec_res), f"Payment of ${amount:.2f} executed post human approval."
    ])

    return {
        "payment_result": exec_res,
        "approval_status": "resolved",
        "answer": f"Payment of ${amount:.2f} for Invoice {inv_num} executed successfully. Ledger updated.",
    }
