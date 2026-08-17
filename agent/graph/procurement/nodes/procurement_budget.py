"""
Procurement Sub-Agent 2: Cross-Agent Budget Verification Sub-Agent
"""
from typing import Dict, Any
import json
from graph.procurement.state import ProcurementAgentState
from graph.finance.graph import finance_head_graph

async def procurement_budget_node(state: ProcurementAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    conv_id = state.get("conversation_id", "conv-proc")
    bid = state.get("bid_data") or {}
    amount = float(bid.get("quote_amount", 0.0))
    dept = state.get("department") or "Engineering"
    
    # Delegate sub-task directly to Finance Head Graph (budget clearance subagent)
    fin_input = {
        "tenant_id": tenant_id,
        "conversation_id": f"{conv_id}-clearance",
        "user_id": "procurement_agent",
        "subagent_target": "budget_clearance",
        "department": dept,
        "clearance_amount": amount,
        "invoice_data": None,
        "po_number": None,
        "approval_id": None,
        "approval_status": None,
        "rag_policy_context": [],
        "po_record": None,
        "match_status": None,
        "anomalies": [],
        "payment_draft": None,
        "payment_result": None,
        "budget_clearance_result": None,
        "answer": "",
        "citations": [],
        "audit_logged": False,
    }
    
    fin_state = await finance_head_graph.ainvoke(fin_input, config={"configurable": {"thread_id": f"{conv_id}-clearance"}})
    res = fin_state.get("budget_clearance_result") or {}
    
    status_str = res.get("status", "BUDGET_DENIED")
    granted = res.get("clearance_granted", False)
    token = res.get("clearance_token")

    return {
        "budget_clearance_status": "APPROVED" if granted else "REJECTED",
        "budget_clearance_token": token,
        "answer": f"Cross-Agent Budget Verification with Finance Agent: {'GRANTED' if granted else 'DENIED'}. Token: {token or 'N/A'}.",
    }
