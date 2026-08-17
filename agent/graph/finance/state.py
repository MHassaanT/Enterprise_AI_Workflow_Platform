"""
Finance Agent State Schema
"""
from typing import TypedDict, Optional, List, Dict, Any

class FinanceAgentState(TypedDict):
    tenant_id: str
    conversation_id: str
    user_id: str
    subagent_target: str # 'invoice_ingestion' | 'invoice_reconciliation' | 'payment_execution' | 'budget_clearance' | 'auto'
    
    # Input data payloads
    invoice_data: Optional[Dict[str, Any]]
    po_number: Optional[str]
    department: Optional[str]
    clearance_amount: Optional[float]
    
    # RAG & PO context
    rag_policy_context: Optional[List[Dict[str, Any]]]
    po_record: Optional[Dict[str, Any]]
    
    # Evaluation & reconciliation results
    match_status: Optional[str] # 'RECONCILED' | 'FLAGGED_FOR_DISCREPANCY'
    anomalies: Optional[List[str]]
    payment_draft: Optional[Dict[str, Any]]
    
    # Execution & Human Approvals
    approval_id: Optional[str]
    approval_status: Optional[str] # 'pending' | 'approved' | 'rejected'
    payment_result: Optional[Dict[str, Any]]
    budget_clearance_result: Optional[Dict[str, Any]]
    
    # Outputs
    answer: str
    citations: List[Dict[str, Any]]
    audit_logged: bool
