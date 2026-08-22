"""
Stage 4: Deliverability Guard Node.
Runs email verifier checks (RFC-5322 syntax, MX DNS lookup, disposable provider filter)
to ensure 100% email validity and protect sender domain reputation.
"""
import asyncio
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

    existing_domains = set(state.get("existing_domains") or [])
    existing_emails = set(state.get("existing_emails") or [])

    if not existing_domains and not existing_emails:
        try:
            from services.db_client import execute_db_query
            ex_query = "SELECT LOWER(contact_email) as contact_email FROM sales_prospects WHERE (deal_stage = 'SENT' OR gmail_message_id IS NOT NULL) AND tenant_id = $1;"
            ex_res = await execute_db_query(ex_query, [tenant_id])
            if ex_res and ex_res.get("rows"):
                for row in ex_res["rows"]:
                    if row.get("contact_email"):
                        existing_emails.add(row["contact_email"].strip().lower())
        except Exception:
            pass

    valid_contacts: List[Dict[str, Any]] = []
    evaluated_count = 0
    discarded_count = 0

    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[STAGE 4 DELIVERABILITY] Starting verification. Discovered contacts count: {len(discovered_contacts)}")

    # Parallel verification of contacts discovered in Stage 3
    async def _verify_single(contact):
        domain = (contact.get("domain") or "").strip().lower()
        email = (contact.get("contact_email") or "").strip().lower()
        source = contact.get("source") or "unknown"

        logger.info(f"[STAGE 4 DELIVERABILITY] Verifying contact: email='{email}', domain='{domain}', source='{source}', email_status='{contact.get('email_status', 'unknown')}'")

        if email and email in existing_emails:
            logger.info(f"[STAGE 4 DELIVERABILITY] Contact '{email}' already received outreach in DB. Skipping duplicate.")
            return None, True

        if not email:
            logger.info(f"[STAGE 4 DELIVERABILITY] Empty email for contact. Discarding.")
            return None, True

        verify_res = await verify_email(email, source=source, tenant_id=tenant_id)
        contact["deliverability"] = verify_res
        logger.info(f"[STAGE 4 DELIVERABILITY] Verification result for '{email}': is_valid={verify_res.get('is_valid')}, status={verify_res.get('status')}, reason='{verify_res.get('reason')}'")
        
        if verify_res.get("is_valid", False):
            return contact, False
        else:
            return contact, True

    if discovered_contacts:
        results = await asyncio.gather(*[_verify_single(c) for c in discovered_contacts])
        for res_contact, is_discarded in results:
            evaluated_count += 1
            if is_discarded:
                discarded_count += 1
            elif res_contact and len(valid_contacts) < prospect_limit:
                valid_contacts.append(res_contact)

    verified_contacts = valid_contacts[:prospect_limit]

    if verified_contacts:
        log_detail = f"Evaluated {evaluated_count} candidate emails, filtered out {discarded_count} invalid/unverified profiles, and collected {len(verified_contacts)} deliverable VALID prospects."
        status_str = "COMPLETED"
    else:
        log_detail = f"Evaluated {evaluated_count} candidate emails and filtered out {discarded_count} unverified or invalid addresses. 0 deliverable prospects found."
        status_str = "FAILED"

    logs.append({
        "stage": "Stage 4: Deliverability Guard",
        "status": status_str,
        "details": log_detail
    })

    return {
        "verified_contacts": verified_contacts,
        "deliverability_result": verified_contacts[0].get("deliverability") if verified_contacts else None,
        "logs": logs,
    }


