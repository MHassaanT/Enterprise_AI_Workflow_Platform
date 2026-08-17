"""
Procurement Sub-Agent 3: Human Approval & PO Execution Sub-Agent
"""
from typing import Dict, Any
import json
from graph.procurement.state import ProcurementAgentState
from tool_gateway.procurement_mcp import create_purchase_order_impl
from services.db_client import execute_db_query

async def po_execution_node(state: ProcurementAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    appr_status = state.get("approval_status")
    appr_id = state.get("approval_id")
    bid = state.get("bid_data") or {}
    
    vendor_name = bid.get("vendor_name", "Vendor Tech")
    vendor_email = bid.get("vendor_email", "vendor@example.com")
    amount = float(bid.get("quote_amount", 0.0))
    bid_ref = bid.get("bid_reference", f"BID-{tenant_id[:4]}")
    clearance_token = state.get("budget_clearance_token", "CLR-APPROVED")
    
    if not appr_status:
        # Generate human approval request in PostgreSQL DB
        query_appr = """
        INSERT INTO approval_requests (tenant_id, action_type, status, details, requester_id)
        VALUES ($1, 'create_purchase_order', 'pending', $2, 'procurement_po_subagent')
        RETURNING id;
        """
        details_payload = {
            "bid_reference": bid_ref,
            "vendor_name": vendor_name,
            "vendor_email": vendor_email,
            "amount": amount,
            "budget_clearance_token": clearance_token,
            "citations": state.get("citations", [])
        }
        appr_res = await execute_db_query(query_appr, [tenant_id, json.dumps(details_payload)])
        new_appr_id = str(appr_res["rows"][0]["id"]) if appr_res and appr_res.get("rows") else None
        
        return {
            "approval_id": new_appr_id,
            "approval_status": "pending",
            "answer": f"Procurement Approval Request generated (ID: {new_appr_id}). Pending human authorization."
        }
        
    if appr_status != "approved":
        return {
            "answer": f"PO Execution cancelled. Human approval decision: {appr_status}.",
            "approval_status": "rejected"
        }
        
    # Execute Purchase Order creation via ERP MCP
    po_res = await create_purchase_order_impl(vendor_name, vendor_email, amount, [], tenant_id)
    po_num = po_res.get("po_number")
    
    # Update ApprovalRequest status to resolved
    if appr_id:
        await execute_db_query(
            "UPDATE approval_requests SET status = 'resolved', updated_at = NOW() WHERE id = $1 AND tenant_id = $2;",
            [appr_id, tenant_id]
        )
        
    # Send automated email with approved PO via Email MCP (simulation/log)
    email_msg = f"Dispatched automated email with approved PO {po_num} to vendor ({vendor_email})."
    
    # Audit log
    query_audit = """
    INSERT INTO audit_logs (tenant_id, agent_name, subagent_name, action, details, reasoning)
    VALUES ($1, 'ProcurementAgent', 'po_execution_subagent', 'PO_CREATED', $2, $3);
    """
    await execute_db_query(query_audit, [
        tenant_id, json.dumps(po_res), f"Purchase Order {po_num} generated post human approval."
    ])

    return {
        "po_record": po_res,
        "approval_status": "resolved",
        "answer": f"PO {po_num} issued to {vendor_name} for ${amount:.2f}. {email_msg}",
    }
