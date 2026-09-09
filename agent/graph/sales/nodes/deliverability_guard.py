"""
Stage 4: Deliverability Guard Node.
Runs email verifier checks (RFC-5322 syntax, MX DNS lookup, disposable provider filter)
to ensure 100% email validity and protect sender domain reputation.
"""
import asyncio
import logging
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from services.email_verifier import verify_email
from services.whatsapp_verifier import check_whatsapp_registration

logger = logging.getLogger(__name__)


async def deliverability_guard_node(state: SalesAgentState) -> Dict[str, Any]:
    prospect_limit = state.get("prospect_limit") or 10
    tenant_id = state.get("tenant_id", "00000000-0000-0000-0000-000000000000")
    discovered_contacts = list(state.get("discovered_contacts", []))
    icp = state.get("icp_config") or {}
    target_titles = icp.get("target_titles", ["VP of Sales", "CTO", "Head of Growth"])
    logs = list(state.get("logs", []))

    if not discovered_contacts and state.get("discovered_contact"):
        discovered_contacts = [state["discovered_contact"]]

    outreach_channel = (state.get("outreach_channel") or "email").lower()
    existing_domains = set(state.get("existing_domains") or [])
    existing_emails = set(state.get("existing_emails") or [])
    existing_phones = set(state.get("existing_phones") or [])

    if not existing_domains and not existing_emails and not existing_phones:
        try:
            from services.db_client import execute_db_query
            ex_query = """
            SELECT LOWER(contact_email) as contact_email, contact_phone 
            FROM sales_prospects 
            WHERE (deal_stage IN ('SENT', 'OUTREACH_SENT') OR gmail_message_id IS NOT NULL OR whatsapp_message_id IS NOT NULL) 
              AND tenant_id = $1;
            """
            ex_res = await execute_db_query(ex_query, [tenant_id])
            if ex_res and ex_res.get("rows"):
                for row in ex_res["rows"]:
                    if row.get("contact_email"):
                        existing_emails.add(row["contact_email"].strip().lower())
                    if row.get("contact_phone"):
                        clean_p = "".join(c for c in str(row["contact_phone"]) if c.isdigit() or c == "+")
                        if clean_p:
                            existing_phones.add(clean_p)
        except Exception:
            pass

    valid_contacts: List[Dict[str, Any]] = []
    evaluated_count = 0
    discarded_count = 0

    logger.info(f"[STAGE 4 DELIVERABILITY] Starting verification. Channel: {outreach_channel}. Discovered count: {len(discovered_contacts)}")

    # Parallel verification of contacts discovered in Stage 3
    async def _verify_single(contact):
        domain = (contact.get("domain") or "").strip().lower()
        email = (contact.get("contact_email") or "").strip().lower()
        phone = contact.get("contact_phone")
        source = contact.get("source") or "unknown"

        logger.info(f"[STAGE 4 DELIVERABILITY] Verifying: email='{email}', phone='{phone}', domain='{domain}', channel='{outreach_channel}'")

        # 1. Deduplication checks
        if outreach_channel == "email" and email and email in existing_emails:
            logger.info(f"[STAGE 4 DELIVERABILITY] Contact email '{email}' already received outreach. Skipping duplicate.")
            return None, True

        clean_phone = "".join(c for c in str(phone) if c.isdigit() or c == "+") if phone else ""
        if outreach_channel == "whatsapp" and clean_phone and clean_phone in existing_phones:
            logger.info(f"[STAGE 4 DELIVERABILITY] Contact phone '{clean_phone}' already received outreach. Skipping duplicate.")
            return None, True

        # 2. Email verification
        verify_res = {"is_valid": False, "status": "NOT_CHECKED"}
        if email:
            verify_res = await verify_email(email, source=source, tenant_id=tenant_id)
        contact["deliverability"] = verify_res

        # 3. WhatsApp verification via Baileys onWhatsApp()
        wa_res = {"checked": False, "exists": False, "status": "NOT_CHECKED"}
        if clean_phone:
            wa_res = await check_whatsapp_registration(clean_phone, tenant_id=tenant_id)
            contact["whatsapp_status"] = wa_res.get("whatsapp_status") or wa_res.get("status", "UNVERIFIED")
            contact["whatsapp_jid"] = wa_res.get("jid")
        else:
            contact["whatsapp_status"] = "NO_PHONE"

        contact["whatsapp_check"] = wa_res
        logger.info(f"[STAGE 4 DELIVERABILITY] Verification results for {contact.get('contact_name')}: Email valid={verify_res.get('is_valid')}, WhatsApp status={contact.get('whatsapp_status')}")

        # 4. Qualification based on target outreach channel
        clean_p = clean_phone.replace("+", "") if clean_phone else ""
        has_phone = bool(clean_p and len(clean_p) >= 7)
        has_valid_email = bool(verify_res.get("is_valid", False))

        if outreach_channel == "whatsapp":
            # For WhatsApp outreach, the prospect MUST have a verified WhatsApp account
            if contact.get("whatsapp_status") == "ON_WHATSAPP":
                return contact, False
            else:
                logger.info(f"[STAGE 4 DELIVERABILITY] Contact '{phone}' discarded: not on WhatsApp (status: {contact.get('whatsapp_status')}).")
                return contact, True
        else:
            # Default Email channel: prospect must pass email deliverability check
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
            elif res_contact:
                valid_contacts.append(res_contact)

    # Prioritize target channel best matches first
    if outreach_channel == "whatsapp":
        valid_contacts.sort(
            key=lambda c: (
                c.get("whatsapp_status") == "ON_WHATSAPP",
                bool(c.get("contact_phone")),
                c.get("deliverability", {}).get("is_valid", False)
            ),
            reverse=True
        )
    else:
        valid_contacts.sort(
            key=lambda c: (
                c.get("deliverability", {}).get("is_valid", False),
                bool(c.get("contact_phone"))
            ),
            reverse=True
        )

    verified_contacts = valid_contacts[:prospect_limit]

    if verified_contacts:
        log_detail = f"Evaluated {evaluated_count} candidate profiles for {outreach_channel.upper()} outreach, filtered out {discarded_count} unqualified/unverified profiles, and collected {len(verified_contacts)} deliverable VALID prospects."
        status_str = "COMPLETED"
    else:
        log_detail = f"Evaluated {evaluated_count} candidate profiles for {outreach_channel.upper()} outreach and filtered out {discarded_count} invalid addresses or unverified numbers. 0 deliverable prospects found."
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


