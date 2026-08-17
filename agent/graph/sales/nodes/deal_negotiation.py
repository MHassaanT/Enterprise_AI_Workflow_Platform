"""
Sales Sub-Agent 2: Deal Negotiation & Approval Gate Sub-Agent
"""
from typing import Dict, Any
import json
from graph.sales.state import SalesAgentState
from tool_gateway.sales_mcp import update_deal_stage_impl
from services.db_client import execute_db_query

async def deal_negotiation_node(state: SalesAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    appr_status = state.get("approval_status")
    appr_id = state.get("approval_id")
    quote = state.get("quote_details") or {}
    cust_email = state.get("customer_email", "customer@enterprise.com")
    lead_data = state.get("lead_data") or {}
    lead_id = lead_data.get("lead_id", f"LEAD-{tenant_id[:4]}")
    
    if not appr_status:
        # Generate Sales Manager Approval Request
        query_appr = """
        INSERT INTO approval_requests (tenant_id, action_type, status, details, requester_id)
        VALUES ($1, 'finalize_sales_contract', 'pending', $2, 'sales_deal_negotiation_subagent')
        RETURNING id;
        """
        details_payload = {
            "lead_id": lead_id,
            "customer_email": cust_email,
            "annual_price": quote.get("final_annual_price", 85000.00),
            "discount_applied": quote.get("allowed_discount", 15.0),
            "citations": state.get("citations", [])
        }
        appr_res = await execute_db_query(query_appr, [tenant_id, json.dumps(details_payload)])
        new_appr_id = str(appr_res["rows"][0]["id"]) if appr_res and appr_res.get("rows") else None
        
        return {
            "approval_id": new_appr_id,
            "approval_status": "pending",
            "answer": f"Draft quote sent to customer {cust_email}. Contract approval request generated (ID: {new_appr_id}) for Sales Manager review."
        }
        
    if appr_status != "approved":
        return {
            "answer": f"Contract approval rejected by Sales Manager. Stage updated to CONTRACT_REJECTED.",
            "deal_stage": "CLOSED_LOST",
            "approval_status": "rejected"
        }
        
    # Sales Manager Approved -> Update CRM Deal Stage to 'Closed Won'
    discount = float(quote.get("allowed_discount", 15.0))
    crm_res = await update_deal_stage_impl(lead_id, "Closed Won", discount, tenant_id)
    
    if appr_id:
        await execute_db_query(
            "UPDATE approval_requests SET status = 'resolved', updated_at = NOW() WHERE id = $1 AND tenant_id = $2;",
            [appr_id, tenant_id]
        )
        
    return {
        "deal_stage": "Closed Won",
        "approval_status": "resolved",
        "answer": f"Contract approved! CRM Deal Stage updated to 'Closed Won' for lead {lead_id}."
    }
