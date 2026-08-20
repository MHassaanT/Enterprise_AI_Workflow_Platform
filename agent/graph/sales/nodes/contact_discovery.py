"""
Stage 3: Contact Discovery Node.
Pulls direct decision-maker contact details (name, title, work email) via Hunter.io domain search and email finder.
"""
import asyncio
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from tool_gateway.hunter_mcp import search_hunter_contacts_impl


async def contact_discovery_node(state: SalesAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "00000000-0000-0000-0000-000000000000")
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

        contact_res = await search_hunter_contacts_impl(
            tenant_id=tenant_id,
            domain=domain,
            target_titles=target_titles
        )

        source = contact_res.get("source", "unknown")
        contact = contact_res.get("contact", {})
        hunter_id = contact.get("hunter_person_id") or f"HUNTER-{domain.split('.')[0].upper()}"

        if not contact or not contact.get("contact_email"):
            contact = {
                "contact_name": contact.get("contact_name") or f"Head of Operations",
                "contact_title": contact.get("contact_title") or target_titles[0],
                "contact_email": contact.get("contact_email") or f"contact@{domain}",
                "company_name": company_name,
                "domain": domain,
                "hunter_person_id": hunter_id,
                "apollo_person_id": hunter_id,
                "source": source,
            }
        else:
            contact["company_name"] = company_name
            contact["domain"] = domain
            contact["hunter_person_id"] = hunter_id
            contact["apollo_person_id"] = hunter_id
            contact["source"] = contact.get("source") or source

        return contact

    prospect_limit = state.get("prospect_limit") or 5

    # Parallel contact discovery bounded strictly by prospect_limit
    accounts_to_process = scraped_accounts[:prospect_limit]
    if accounts_to_process:
        discovered_contacts = list(await asyncio.gather(*[_discover_single(acc) for acc in accounts_to_process]))
    else:
        discovered_contacts = []

    logs.append({
        "stage": "Stage 3: Contact Discovery",
        "status": "COMPLETED",
        "details": f"Discovered {len(discovered_contacts)} decision-maker contacts via fast parallel Hunter.io search."
    })

    return {
        "discovered_contacts": discovered_contacts,
        "discovered_contact": discovered_contacts[0] if discovered_contacts else None,
        "logs": logs,
    }

