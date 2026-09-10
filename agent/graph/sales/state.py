"""
AI Sales Agent (Autonomous WhatsApp SDR) State Schema.
Exclusively structured for Google Places Discovery, Gemini Evaluation,
Baileys onWhatsApp verification, and WhatsApp outreach dispatch.
"""
from typing import TypedDict, Optional, List, Dict, Any


class SalesAgentState(TypedDict, total=False):
    tenant_id: str
    run_id: str
    user_id: str

    # Execution parameters
    prospect_limit: Optional[int]
    target_domain: Optional[str]
    auto_send_whatsapp: Optional[bool]
    outreach_channel: Optional[str]  # Always 'whatsapp'

    # Deduplication tracking across loops
    existing_domains: List[str]
    existing_phones: List[str]

    # Stage 1: Google Places Discovery
    icp_config: Dict[str, Any]
    raw_places: List[Dict[str, Any]]

    # Stage 2: Gemini Evaluation (ICP Qualification & Fit Scoring)
    qualified_places: List[Dict[str, Any]]
    account_fit_passed: bool

    # Stage 3: Baileys onWhatsApp Deliverability Guard
    verified_prospects: List[Dict[str, Any]]

    # Stage 4: Gemini WhatsApp Pitch Generation
    outreach_batch: List[Dict[str, Any]]
    icp_score: float
    generated_outreach: Optional[Dict[str, Any]]

    # Stage 5: WhatsApp Dispatch & CRM Persistence
    processed_count: int
    outreach_sent: bool
    whatsapp_message_id: Optional[str]
    whatsapp_status: Optional[str]
    deal_stage: str
    quote_details: Optional[Dict[str, Any]]

    # Execution Audit Trail
    logs: List[Dict[str, Any]]
    answer: str

    # Backward compatibility aliases
    discovered_contact: Optional[Dict[str, Any]]
    discovered_contacts: List[Dict[str, Any]]
    verified_contacts: List[Dict[str, Any]]
    scraped_accounts: List[Dict[str, Any]]
    raw_accounts: List[Dict[str, Any]]
