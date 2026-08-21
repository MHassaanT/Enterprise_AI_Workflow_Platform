"""
Stage 3: Contact Discovery Node.
Pulls direct decision-maker contact details (name, title, work email) via Hunter.io domain search and email finder.
"""
import asyncio
import logging
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from tool_gateway.hunter_mcp import search_hunter_contacts_impl

logger = logging.getLogger(__name__)


async def contact_discovery_node(state: SalesAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "00000000-0000-0000-0000-000000000000")
    logger.info(f"[STAGE 3 CONTACT DISCOVERY] Starting. tenant_id='{tenant_id}', prospect_limit={state.get('prospect_limit')}")
    logger.info(f"[STAGE 3] scraped_accounts count={len(state.get('scraped_accounts', []))}, raw_accounts count={len(state.get('raw_accounts', []))}")

    scraped_accounts = state.get("scraped_accounts", [])
    icp = state.get("icp_config") or {}
    logs = list(state.get("logs", []))

    if not scraped_accounts:
        scraped_accounts = state.get("raw_accounts", [])

    target_titles = icp.get("target_titles", ["VP of Sales", "CTO", "Head of Growth"])
    if isinstance(target_titles, str):
        import json
        try:
            target_titles = json.loads(target_titles)
        except Exception:
            target_titles = [target_titles]

    async def _discover_single(account):
        domain = account.get("domain", "enterprise.com")
        company_name = account.get("company_name", domain.split(".")[0].title())
        logger.info(f"[STAGE 3] Discovering contact for domain='{domain}', company='{company_name}'")

        contact_res = await search_hunter_contacts_impl(
            tenant_id=tenant_id,
            domain=domain,
            target_titles=target_titles
        )

        source = contact_res.get("source", "unknown")
        contact = contact_res.get("contact")
        hunter_id = (contact.get("hunter_person_id") if contact else None) or f"HUNTER-{domain.split('.')[0].upper()}"

        if not contact or not contact.get("contact_email"):
            logger.info(f"[STAGE 3] No real contact found on Hunter.io for domain '{domain}'. Dropping account.")
            return None
        
        contact["company_name"] = company_name
        contact["domain"] = domain
        contact["hunter_person_id"] = hunter_id
        contact["apollo_person_id"] = hunter_id
        contact["source"] = contact.get("source") or source
        logger.info(f"[STAGE 3] ✅ Real contact found for {domain}: {contact.get('contact_email')} (source={contact.get('source')})")

        return contact

    prospect_limit = state.get("prospect_limit") or 10

    # Parallel contact discovery bounded strictly by prospect_limit
    accounts_to_process = scraped_accounts[:prospect_limit]
    logger.info(f"[STAGE 3] Processing {len(accounts_to_process)} accounts (prospect_limit={prospect_limit})")
    if accounts_to_process:
        raw_discovered = await asyncio.gather(*[_discover_single(acc) for acc in accounts_to_process])
        discovered_contacts = [c for c in raw_discovered if c is not None]
    else:
        discovered_contacts = []

    # Log summary of all discovered contacts
    for idx, c in enumerate(discovered_contacts):
        logger.info(f"[STAGE 3] Real Contact #{idx+1}: email='{c.get('contact_email')}', source='{c.get('source')}', domain='{c.get('domain')}'")

    status_str = "COMPLETED" if discovered_contacts else "NO_LEADS_FOUND"
    logs.append({
        "stage": "Stage 3: Contact Discovery",
        "status": status_str,
        "details": f"Discovered {len(discovered_contacts)} real decision-maker contacts via Hunter.io search."
    })

    return {
        "discovered_contacts": discovered_contacts,
        "discovered_contact": discovered_contacts[0] if discovered_contacts else None,
        "logs": logs,
    }

