"""
AI Sales Agent (AI SDR/BDR) State Schema
"""
from typing import TypedDict, Optional, List, Dict, Any

class SalesAgentState(TypedDict):
    tenant_id: str
    run_id: str
    user_id: str
    
    # Execution parameters
    prospect_limit: Optional[int]
    target_domain: Optional[str]
    auto_send_email: Optional[bool]
    
    # Stage 1: Sourcing & Business Understanding
    icp_config: Dict[str, Any]
    raw_accounts: List[Dict[str, Any]]
    
    # Stage 2: Account Fit Check (Crawl4AI)
    scraped_accounts: List[Dict[str, Any]]
    scraped_context: Dict[str, Any]
    account_fit_passed: bool
    
    # Stage 3: Contact Discovery (Search + Pattern Inference)
    discovered_contacts: List[Dict[str, Any]]
    discovered_contact: Optional[Dict[str, Any]]
    
    # Stage 4: Deliverability Guard (Email Verifier)
    verified_contacts: List[Dict[str, Any]]
    deliverability_result: Optional[Dict[str, Any]]
    
    # Stage 5: Scoring & Copy Generation (OpenRouter LLM)
    outreach_batch: List[Dict[str, Any]]
    icp_score: float
    generated_outreach: Optional[Dict[str, Any]]
    
    # Stage 6: Dispatch & CRM Deal Logging (Gmail API)
    processed_count: int
    outreach_sent: bool
    gmail_message_id: Optional[str]
    deal_stage: str
    quote_details: Optional[Dict[str, Any]]
    
    # Execution Audit Trail
    logs: List[Dict[str, Any]]
    answer: str
