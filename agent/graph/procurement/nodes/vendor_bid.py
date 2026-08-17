"""
Procurement Sub-Agent 1: Vendor Bid Ingestion & Compliance Check Sub-Agent
"""
from typing import Dict, Any
import json
from graph.procurement.state import ProcurementAgentState
from services.rag_client import query_rag
from tool_gateway.procurement_mcp import record_vendor_bid_impl

async def vendor_bid_node(state: ProcurementAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    bid = state.get("bid_data") or {}
    
    vendor_name = bid.get("vendor_name", "Vendor Tech")
    vendor_email = bid.get("vendor_email", "vendor@example.com")
    amount = float(bid.get("quote_amount", 0.0))
    bid_ref = bid.get("bid_reference", f"BID-{tenant_id[:4]}")
    
    # 1. Query vector store for purchasing policies & vendor criteria
    query_str = f"purchasing policy approved vendor criteria hardware minimum specs quote amount {amount}"
    rag_res = await query_rag(query_str, tenant_id)
    rag_chunks = rag_res.get("chunks", [])
    citations = rag_res.get("citations", [])
    
    compliance_status = "COMPLIANT" if amount <= 250000.0 else "NON_COMPLIANT"
    
    # 2. Log incoming vendor request in DB
    record_res = await record_vendor_bid_impl(
        bid_ref, vendor_name, vendor_email, amount, bid.get("equipment_details", {}), tenant_id
    )

    return {
        "rag_policy_context": rag_chunks,
        "citations": citations,
        "compliance_status": compliance_status,
        "answer": f"Ingested bid {bid_ref} from {vendor_name} (${amount:.2f}). Compliance check against RAG policy: {compliance_status}.",
    }
