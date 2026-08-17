"""
Sales Sub-Agent 1: Lead Ingestion & Quote Generation Sub-Agent
"""
from typing import Dict, Any
from graph.sales.state import SalesAgentState
from services.rag_client import query_rag
from tool_gateway.sales_mcp import fetch_lead_history_impl

async def lead_pricing_node(state: SalesAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    cust_email = state.get("customer_email", "customer@enterprise.com")
    tier = state.get("tier_requested", "Enterprise")
    req_discount = float(state.get("requested_discount") or 10.0)
    
    # 1. Check if lead exists / fetch history from CRM
    lead_res = await fetch_lead_history_impl(cust_email, tenant_id)
    lead_data = lead_res.get("lead") or {}
    
    # 2. Query pricing & discount policies in Qdrant RAG
    query_str = f"pricing structure discount policy max allowed discount enterprise tier contract terms"
    rag_res = await query_rag(query_str, tenant_id)
    rag_chunks = rag_res.get("chunks", [])
    citations = rag_res.get("citations", [])
    
    # Enforce policy rule: max discount 15%
    allowed_discount = min(req_discount, 15.0)
    base_price = 100000.00 if tier == "Enterprise" else 50000.00
    final_price = base_price * (1.0 - allowed_discount / 100.0)
    
    quote_details = {
        "tier": tier,
        "base_price": base_price,
        "requested_discount": req_discount,
        "allowed_discount": allowed_discount,
        "final_annual_price": final_price,
        "contract_terms": "Standard 12-month Enterprise License with 24/7 SLA Support."
    }

    return {
        "lead_data": lead_data,
        "rag_policy_context": rag_chunks,
        "citations": citations,
        "quote_details": quote_details,
        "answer": f"Drafted Enterprise Sales Quote for {cust_email}. Quoted Annual Price: ${final_price:.2f} ({allowed_discount}% discount applied, capped at max 15%).",
    }
