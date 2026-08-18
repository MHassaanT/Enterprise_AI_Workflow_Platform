"""
AI Sales Agent (AI SDR/BDR) State Schema
"""
from typing import TypedDict, Optional, List, Dict, Any

class SalesAgentState(TypedDict):
    tenant_id: str
    run_id: str
    user_id: str
    
    # Stage 1: Sourcing & Business Understanding
    icp_config: Dict[str, Any]
    target_domain: Optional[str]
    raw_accounts: List[Dict[str, Any]]
    
    # Stage 2: Account Fit Check (Crawl4AI)
    scraped_context: Dict[str, Any]
    account_fit_passed: bool
    
    # Stage 3: Contact Discovery (Apollo API)
    discovered_contact: Optional[Dict[str, Any]]
    
    # Stage 4: Deliverability Guard (Email Verifier)
    deliverability_result: Optional[Dict[str, Any]]
    
    # Stage 5: Scoring & Copy Generation (OpenRouter LLM)
    icp_score: float
    generated_outreach: Optional[Dict[str, Any]]
    
    # Stage 6: Dispatch & CRM Deal Logging (Gmail API)
    outreach_sent: bool
    gmail_message_id: Optional[str]
    deal_stage: str
    quote_details: Optional[Dict[str, Any]]
    
    # Execution Audit Trail
    logs: List[Dict[str, Any]]
    answer: str
