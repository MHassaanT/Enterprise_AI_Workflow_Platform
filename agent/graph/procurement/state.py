"""
Procurement Agent State Schema
"""
from typing import TypedDict, Optional, List, Dict, Any

class ProcurementAgentState(TypedDict):
    tenant_id: str
    conversation_id: str
    user_id: str
    subagent_target: str # 'vendor_bid' | 'procurement_budget' | 'po_execution' | 'auto'
    
    # Input data
    bid_data: Optional[Dict[str, Any]]
    department: Optional[str]
    
    # Analysis & RAG
    rag_policy_context: Optional[List[Dict[str, Any]]]
    citations: List[Dict[str, Any]]
    compliance_status: Optional[str] # 'COMPLIANT' | 'NON_COMPLIANT'
    
    # Cross-Agent Clearance
    budget_clearance_status: Optional[str] # 'REQUESTED' | 'APPROVED' | 'REJECTED'
    budget_clearance_token: Optional[str]
    
    # Human Approval & PO execution
    approval_id: Optional[str]
    approval_status: Optional[str]
    po_record: Optional[Dict[str, Any]]
    
    # Outputs
    answer: str
    audit_logged: bool
