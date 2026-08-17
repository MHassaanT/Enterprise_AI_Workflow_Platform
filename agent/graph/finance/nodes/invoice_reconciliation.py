"""
Finance Sub-Agent 2: Invoice Reconciliation & Audit Sub-Agent
"""
from typing import Dict, Any
import json
from graph.finance.state import FinanceAgentState
from services.db_client import execute_db_query

async def invoice_reconciliation_node(state: FinanceAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    inv = state.get("invoice_data") or {}
    po = state.get("po_record") or {}
    citations = state.get("citations") or []
    
    inv_num = inv.get("invoice_number", f"INV-{tenant_id[:4]}")
    po_num = po.get("po_number") or inv.get("po_number", "PO-UNKNOWN")
    inv_total = float(inv.get("total_amount", 0.0))
    po_total = float(po.get("amount", 0.0)) if po else 0.0
    
    anomalies = []
    if not po:
        anomalies.append(f"Purchase Order {po_num} does not exist in database.")
    elif abs(inv_total - po_total) > 0.01:
        anomalies.append(f"Price discrepancy: Invoice total (${inv_total:.2f}) does not match PO amount (${po_total:.2f}).")
        
    is_match = len(anomalies) == 0
    match_status = "RECONCILED" if is_match else "FLAGGED_FOR_DISCREPANCY"
    
    # 1. Update/insert invoice record in PostgreSQL
    query_inv = """
    INSERT INTO invoices (tenant_id, invoice_number, po_number, vendor_name, vendor_email, total_amount, match_status, anomalies, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE SET match_status = EXCLUDED.match_status, anomalies = EXCLUDED.anomalies
    RETURNING id;
    """
    inv_res = await execute_db_query(query_inv, [
        tenant_id, inv_num, po_num, inv.get("vendor_name", "Vendor"), inv.get("vendor_email", "vendor@example.com"),
        inv_total, match_status, json.dumps(anomalies), "PENDING"
    ])
    
    approval_id = None
    if not is_match:
        # Mismatch -> Flagged & draft vendor email
        draft_msg = f"Drafted clarification email to vendor ({inv.get('vendor_email', 'vendor@example.com')}): Anomalies detected for Invoice {inv_num}: {', '.join(anomalies)}"
        answer = f"Invoice {inv_num} flagged for discrepancy. {draft_msg}"
    else:
        # Match -> Insert ApprovalRequest for human payment approval
        query_appr = """
        INSERT INTO approval_requests (tenant_id, action_type, status, details, requester_id)
        VALUES ($1, 'execute_payment', 'pending', $2, 'finance_reconciliation_subagent')
        RETURNING id;
        """
        details_payload = {
            "invoice_number": inv_num,
            "po_number": po_num,
            "amount": inv_total,
            "vendor_email": inv.get("vendor_email", "vendor@example.com"),
            "citations": citations
        }
        appr_res = await execute_db_query(query_appr, [tenant_id, json.dumps(details_payload)])
        if appr_res and appr_res.get("rows"):
            approval_id = str(appr_res["rows"][0]["id"])
            
        answer = f"Invoice {inv_num} successfully reconciled with PO {po_num}. Payment approval request generated (ID: {approval_id})."
        
    # Write Audit Log
    query_audit = """
    INSERT INTO audit_logs (tenant_id, agent_name, subagent_name, action, details, reasoning, citations)
    VALUES ($1, 'FinanceAgent', 'invoice_reconciliation_subagent', $2, $3, $4, $5);
    """
    await execute_db_query(query_audit, [
        tenant_id, f"RECONCILE_INVOICE_{match_status}", json.dumps({"invoice_number": inv_num, "anomalies": anomalies}),
        f"Reconciliation result: {match_status}", json.dumps(citations)
    ])

    return {
        "match_status": match_status,
        "anomalies": anomalies,
        "approval_id": approval_id,
        "approval_status": "pending" if approval_id else None,
        "audit_logged": True,
        "answer": answer,
    }
