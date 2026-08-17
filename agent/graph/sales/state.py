"""
Sales Agent State Schema
"""
from typing import TypedDict, Optional, List, Dict, Any

class SalesAgentState(TypedDict):
    tenant_id: str
    conversation_id: str
    user_id: str
    subagent_target: str # 'lead_pricing' | 'deal_negotiation' | 'sales_financial_sync' | 'auto'
    
    # Customer request & lead details
    customer_email: str
    tier_requested: str
    requested_discount: Optional[float]
    lead_data: Optional[Dict[str, Any]]
    
    # RAG & Quote
    rag_policy_context: Optional[List[Dict[str, Any]]]
    citations: List[Dict[str, Any]]
    quote_details: Optional[Dict[str, Any]]
    
    # Approval & Contract
    customer_accepted: bool
    approval_id: Optional[str]
    approval_status: Optional[str] # 'pending' | 'approved' | 'rejected'
    deal_stage: Optional[str] # 'Closed Won' | 'CONTRACT_PENDING'
    
    # Financial Sync Output
    financial_sync_result: Optional[Dict[str, Any]]
    
    # Outputs
    answer: str
    audit_logged: bool
