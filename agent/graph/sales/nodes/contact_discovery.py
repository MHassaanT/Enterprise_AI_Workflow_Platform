"""
Stage 3: Contact Discovery Node.
Pulls direct decision-maker contact details (name, title, work email) via Apollo waterfall search.
"""
from typing import Dict, Any
from graph.sales.state import SalesAgentState
from tool_gateway.apollo_mcp import search_apollo_contacts_impl


async def contact_discovery_node(state: SalesAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default_tenant")
    domain = state.get("target_domain") or "enterprise.com"
    icp = state.get("icp_config") or {}
    logs = list(state.get("logs", []))

    if not state.get("account_fit_passed", True):
        logs.append({
            "stage": "Stage 3: Contact Discovery",
            "status": "SKIPPED",
            "details": "Account did not pass fit check. Skipping contact discovery to save credits."
        })
        return {"discovered_contact": None, "logs": logs}

    target_titles = icp.get("target_titles", ["VP of Sales", "CTO", "Head of Growth"])
    if isinstance(target_titles, str):
        import json
        try:
            target_titles = json.loads(target_titles)
        except Exception:
            target_titles = [target_titles]

    # Execute Apollo Contact Discovery Search
    contact_res = await search_apollo_contacts_impl(
        tenant_id=tenant_id,
        domain=domain,
        target_titles=target_titles
    )

    contact = contact_res.get("contact", {})

    logs.append({
        "stage": "Stage 3: Contact Discovery",
        "status": "COMPLETED",
        "details": f"Discovered decision maker: {contact.get('contact_name')} ({contact.get('contact_title')}) at {domain}."
    })

    return {
        "discovered_contact": contact,
        "logs": logs,
    }
