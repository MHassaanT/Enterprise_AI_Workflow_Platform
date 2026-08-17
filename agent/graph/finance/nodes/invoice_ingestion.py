"""
Finance Sub-Agent 1: Invoice Ingestion & Parsing Sub-Agent
"""
from typing import Dict, Any
from graph.finance.state import FinanceAgentState
from services.rag_client import query_rag
from tool_gateway.finance_mcp import fetch_po_details_impl

async def invoice_ingestion_node(state: FinanceAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    inv = state.get("invoice_data") or {}
    po_num = state.get("po_number") or inv.get("po_number") or ""
    
    # 1. Query vector store for tenant budget policies & vendor terms
    query_str = f"invoice payment policy minimum PO threshold vendor terms for invoice {inv.get('invoice_number', '')}"
    rag_res = await query_rag(query_str, tenant_id)
    rag_chunks = rag_res.get("chunks", [])
    citations = rag_res.get("citations", [])
    
    # 2. Fetch corresponding Purchase Order (PO) record from DB
    po_res = await fetch_po_details_impl(po_num, tenant_id) if po_num else {"status": "not_found"}
    po_record = po_res.get("po") if po_res.get("status") == "found" else None
    
    return {
        "rag_policy_context": rag_chunks,
        "citations": citations,
        "po_record": po_record,
        "answer": f"Parsed invoice {inv.get('invoice_number', 'N/A')}. Retrieved {len(rag_chunks)} RAG policy chunks and PO status: {'Found' if po_record else 'Not Found'}.",
    }
