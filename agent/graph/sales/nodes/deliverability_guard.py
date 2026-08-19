"""
Stage 4: Deliverability Guard Node.
Runs email verifier checks (RFC-5322 syntax, MX DNS lookup, disposable provider filter)
to ensure 100% email validity and protect sender domain reputation.
"""
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from services.email_verifier import verify_email


async def deliverability_guard_node(state: SalesAgentState) -> Dict[str, Any]:
    prospect_limit = state.get("prospect_limit") or 10
    tenant_id = state.get("tenant_id", "00000000-0000-0000-0000-000000000000")
    discovered_contacts = list(state.get("discovered_contacts", []))
    icp = state.get("icp_config") or {}
    target_titles = icp.get("target_titles", ["VP of Sales", "CTO", "Head of Growth"])
    logs = list(state.get("logs", []))

    if not discovered_contacts and state.get("discovered_contact"):
        discovered_contacts = [state["discovered_contact"]]

    valid_contacts: List[Dict[str, Any]] = []
    evaluated_count = 0
    discarded_count = 0
    tested_domains = set()

    # 1. Verify contacts already discovered in Stage 3
    for contact in discovered_contacts:
        if len(valid_contacts) >= prospect_limit:
            break
        domain = contact.get("domain", "")
        if domain:
            tested_domains.add(domain)

        email = contact.get("contact_email")
        evaluated_count += 1
        if not email:
            discarded_count += 1
            continue

        # Run Deliverability Verification Engine
        verify_res = await verify_email(email)
        contact["deliverability"] = verify_res
        if verify_res.get("is_valid", False):
            valid_contacts.append(contact)
        else:
            discarded_count += 1

    # 2. If valid contacts count is less than target prospect_limit, source and verify additional prospects
    if len(valid_contacts) < prospect_limit:
        from tool_gateway.apollo_mcp import search_apollo_accounts_impl, search_apollo_contacts_impl

        target_industries = icp.get("target_industries", ["Software", "SaaS"])
        if isinstance(target_industries, str):
            import json
            try:
                target_industries = json.loads(target_industries)
            except Exception:
                target_industries = [target_industries]

        extra_accounts_res = await search_apollo_accounts_impl(
            tenant_id=tenant_id,
            target_industries=target_industries,
            limit=max(prospect_limit * 4, 50)
        )
        candidate_accounts = extra_accounts_res.get("accounts", [])

        for account in candidate_accounts:
            if len(valid_contacts) >= prospect_limit:
                break
            domain = account.get("domain")
            if not domain or domain in tested_domains:
                continue
            
            tested_domains.add(domain)
            c_res = await search_apollo_contacts_impl(
                tenant_id=tenant_id,
                domain=domain,
                target_titles=target_titles if isinstance(target_titles, list) else [target_titles]
            )
            cand_contact = c_res.get("contact", {})
            cand_email = cand_contact.get("contact_email")
            evaluated_count += 1

            if not cand_email:
                discarded_count += 1
                continue

            verify_res = await verify_email(cand_email)
            cand_contact["deliverability"] = verify_res
            cand_contact["company_name"] = account.get("company_name", domain.split(".")[0].title())
            cand_contact["domain"] = domain

            if verify_res.get("is_valid", False):
                valid_contacts.append(cand_contact)
            else:
                discarded_count += 1

    verified_contacts = valid_contacts[:prospect_limit]

    logs.append({
        "stage": "Stage 4: Deliverability Guard",
        "status": "COMPLETED",
        "details": f"Ran RFC 5322 syntax & MX DNS verification. Evaluated {evaluated_count} candidate emails, filtered out {discarded_count} invalid profiles, and collected exactly {len(verified_contacts)} deliverable VALID prospects (Target limit: {prospect_limit})."
    })

    return {
        "verified_contacts": verified_contacts,
        "deliverability_result": verified_contacts[0].get("deliverability") if verified_contacts else None,
        "logs": logs,
    }
