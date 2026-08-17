"""
Supervisor Multi-Agent Central Orchestrator Graph
"""
from typing import Dict, Any
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from graph.supervisor.state import SupervisorState
from graph.finance.graph import finance_head_graph
from graph.procurement.graph import procurement_head_graph
from graph.sales.graph import sales_head_graph


async def route_finance_node(state: SupervisorState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    conv_id = state.get("conversation_id", "conv-sup")
    payload = state.get("payload") or {}
    
    fin_input = {
        "tenant_id": tenant_id,
        "conversation_id": f"{conv_id}-fin",
        "user_id": "supervisor_graph",
        "subagent_target": payload.get("subagent_target", "invoice_ingestion"),
        "invoice_data": payload.get("invoice_data"),
        "po_number": payload.get("po_number"),
        "department": payload.get("department"),
        "clearance_amount": payload.get("clearance_amount"),
        "approval_id": payload.get("approval_id"),
        "approval_status": payload.get("approval_status"),
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
    
    fin_res = await finance_head_graph.ainvoke(fin_input, config={"configurable": {"thread_id": f"{conv_id}-fin"}})
    history = state.get("route_history", []) + ["Supervisor -> FinanceHead"]
    return {
        "result": fin_res,
        "answer": fin_res.get("answer", "Finance operation completed."),
        "route_history": history
    }


async def route_procurement_node(state: SupervisorState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    conv_id = state.get("conversation_id", "conv-sup")
    payload = state.get("payload") or {}
    
    proc_input = {
        "tenant_id": tenant_id,
        "conversation_id": f"{conv_id}-proc",
        "user_id": "supervisor_graph",
        "subagent_target": payload.get("subagent_target", "vendor_bid"),
        "bid_data": payload.get("bid_data"),
        "department": payload.get("department", "Engineering"),
        "rag_policy_context": [],
        "citations": [],
        "compliance_status": None,
        "budget_clearance_status": None,
        "budget_clearance_token": None,
        "approval_id": payload.get("approval_id"),
        "approval_status": payload.get("approval_status"),
        "po_record": None,
        "answer": "",
        "audit_logged": False,
    }
    
    proc_res = await procurement_head_graph.ainvoke(proc_input, config={"configurable": {"thread_id": f"{conv_id}-proc"}})
    history = state.get("route_history", []) + ["Supervisor -> ProcurementHead"]
    return {
        "result": proc_res,
        "answer": proc_res.get("answer", "Procurement operation completed."),
        "route_history": history
    }


async def route_sales_node(state: SupervisorState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    conv_id = state.get("conversation_id", "conv-sup")
    payload = state.get("payload") or {}
    
    sales_input = {
        "tenant_id": tenant_id,
        "conversation_id": f"{conv_id}-sales",
        "user_id": "supervisor_graph",
        "subagent_target": payload.get("subagent_target", "lead_pricing"),
        "customer_email": payload.get("customer_email", "customer@enterprise.com"),
        "tier_requested": payload.get("tier_requested", "Enterprise"),
        "requested_discount": payload.get("requested_discount", 10.0),
        "lead_data": None,
        "rag_policy_context": [],
        "citations": [],
        "quote_details": None,
        "customer_accepted": True,
        "approval_id": payload.get("approval_id"),
        "approval_status": payload.get("approval_status"),
        "deal_stage": None,
        "financial_sync_result": None,
        "answer": "",
        "audit_logged": False,
    }
    
    sales_res = await sales_head_graph.ainvoke(sales_input, config={"configurable": {"thread_id": f"{conv_id}-sales"}})
    history = state.get("route_history", []) + ["Supervisor -> SalesHead"]
    return {
        "result": sales_res,
        "answer": sales_res.get("answer", "Sales operation completed."),
        "route_history": history
    }


def route_domain(state: SupervisorState) -> str:
    domain = state.get("target_domain", "finance").lower()
    if domain == "procurement":
        return "procurement"
    elif domain == "sales":
        return "sales"
    return "finance"


def build_supervisor_graph():
    builder = StateGraph(SupervisorState)

    builder.add_node("finance", route_finance_node)
    builder.add_node("procurement", route_procurement_node)
    builder.add_node("sales", route_sales_node)

    builder.add_conditional_edges(
        START,
        route_domain,
        {
            "finance": "finance",
            "procurement": "procurement",
            "sales": "sales",
        }
    )

    builder.add_edge("finance", END)
    builder.add_edge("procurement", END)
    builder.add_edge("sales", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


supervisor_graph = build_supervisor_graph()
