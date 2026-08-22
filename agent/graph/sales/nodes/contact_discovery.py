"""
Stage 3: Contact Discovery Node.
Finds named decision-maker contacts via Serper search + email pattern inference.
Uses search snippets (company bios, press mentions, conference speakers) to identify
real people, then infers candidate emails from the company's detected email pattern.

Every contact is explicitly tagged with email_status: "inferred_unverified" so that
Stage 4 (Deliverability Guard) must verify it before downstream use. No fabricated
names, titles, emails, or personas are ever produced.
"""
import asyncio
import json
import logging
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from tool_gateway.search_discovery import search_contact_person
from tool_gateway.email_pattern_engine import detect_and_infer

logger = logging.getLogger(__name__)


async def contact_discovery_node(state: SalesAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "00000000-0000-0000-0000-000000000000")
    logger.info(f"[STAGE 3 CONTACT DISCOVERY] Starting. tenant_id='{tenant_id}', prospect_limit={state.get('prospect_limit')}")

    scraped_accounts = state.get("scraped_accounts", [])
    icp = state.get("icp_config") or {}
    logs = list(state.get("logs", []))

    logger.info(f"[STAGE 3] scraped_accounts count={len(scraped_accounts)}")

    if not scraped_accounts:
        logs.append({
            "stage": "Stage 3: Contact Discovery",
            "status": "SKIPPED",
            "details": "No qualified accounts from Stage 2. Nothing to discover.",
        })
        return {
            "discovered_contacts": [],
            "discovered_contact": None,
            "logs": logs,
        }

    target_titles = icp.get("target_titles", ["VP of Sales", "CTO", "Head of Growth"])
    if isinstance(target_titles, str):
        try:
            target_titles = json.loads(target_titles)
        except Exception:
            target_titles = [target_titles]

    prospect_limit = state.get("prospect_limit") or 10

    async def _discover_single(account: Dict[str, Any]) -> Dict[str, Any] | None:
        domain = account.get("domain", "")
        company_name = account.get("company_name", domain.split(".")[0].title() if domain else "Unknown")
        pattern_emails = account.get("pattern_emails", [])

        logger.info(f"[STAGE 3] Discovering contact for domain='{domain}', company='{company_name}', pattern_emails={pattern_emails}")

        # 1. Search for a named person via Serper
        person_result = await search_contact_person(
            tenant_id=tenant_id,
            company_name=company_name,
            domain=domain,
            target_titles=target_titles,
        )

        if person_result.get("status") != "found" or not person_result.get("contact"):
            reason = person_result.get("reason", "No person found.")
            logger.info(f"[STAGE 3] No named individual found for {domain}. Falling back to business management mailbox.")
            fallback_email = pattern_emails[0] if pattern_emails else f"info@{domain}"
            full_name = f"{company_name} Management"
            first_name = company_name.split()[0]
            last_name = "Management"
            title = "General Manager / Owner"
            person = {"name": full_name, "first_name": first_name, "last_name": last_name, "title": title}
        else:
            person = person_result["contact"]
            first_name = person.get("first_name", "")
            last_name = person.get("last_name", "")
            full_name = person.get("name", f"{first_name} {last_name}".strip())
            title = person.get("title", "")

        logger.info(f"[STAGE 3] Decision maker for {domain}: {full_name} ({title})")

        # 2. Infer candidate email from pattern
        inference = None
        if pattern_emails:
            inference = detect_and_infer(
                pattern_emails=pattern_emails,
                first_name=first_name,
                last_name=last_name,
                domain=domain,
            )

        if not inference:
            # Fallback to standard candidate patterns for name/domain
            clean_first = first_name.lower().strip() if first_name else ""
            clean_last = last_name.lower().strip() if last_name else ""
            if clean_first and len(clean_first) >= 3:
                candidate_email = f"{clean_first}@{domain}"
                pattern_used = "first"
            elif clean_first and clean_last:
                candidate_email = f"{clean_first}.{clean_last}@{domain}"
                pattern_used = "first.last"
            else:
                candidate_email = f"contact@{domain}"
                pattern_used = "contact_role"

            inference = {
                "email": candidate_email,
                "pattern_used": pattern_used,
                "email_status": "inferred_unverified",
                "source_email": "standard_candidate_fallback",
            }

        candidate_email = inference["email"]
        pattern_used = inference["pattern_used"]
        email_status = inference["email_status"]  # Always "inferred_unverified"

        logger.info(f"[STAGE 3] ✅ Inferred email for {domain}: {candidate_email} (pattern={pattern_used}, status={email_status})")

        # 3. Build contact record compatible with Stage 4/5
        contact_id = f"SERPER-{domain.split('.')[0].upper()}"
        contact = {
            "contact_name": full_name,
            "contact_title": title,
            "contact_email": candidate_email,
            "email_status": email_status,
            "pattern_used": pattern_used,
            "pattern_source_email": inference.get("pattern_source_email", ""),
            "company_name": company_name,
            "domain": domain,
            "industry": account.get("industry", ""),
            "source": "serper_pattern_inferred",
            "hunter_person_id": contact_id,
            "apollo_person_id": contact_id,
        }

        return contact

    # Parallel contact discovery bounded by prospect_limit
    accounts_to_process = scraped_accounts[:prospect_limit]
    logger.info(f"[STAGE 3] Processing {len(accounts_to_process)} accounts (prospect_limit={prospect_limit})")

    if accounts_to_process:
        raw_discovered = await asyncio.gather(*[_discover_single(acc) for acc in accounts_to_process])
        discovered_contacts = [c for c in raw_discovered if c is not None]
    else:
        discovered_contacts = []

    # Log summary of all discovered contacts
    for idx, c in enumerate(discovered_contacts):
        logger.info(
            f"[STAGE 3] Contact #{idx+1}: {c.get('contact_name')} ({c.get('contact_title')}) "
            f"email='{c.get('contact_email')}' status={c.get('email_status')} "
            f"pattern={c.get('pattern_used')} domain='{c.get('domain')}'"
        )

    # Summary stats
    total_processed = len(accounts_to_process)
    found_count = len(discovered_contacts)
    skipped_count = total_processed - found_count

    if discovered_contacts:
        status_str = "COMPLETED"
        details = (
            f"Processed {total_processed} qualified accounts. "
            f"Found {found_count} named contacts with inferred emails. "
            f"Skipped {skipped_count} accounts (no person found or no email pattern available)."
        )
    else:
        status_str = "NO_LEADS_FOUND"
        details = (
            f"Processed {total_processed} qualified accounts but found 0 named contacts "
            f"with inferable emails. All accounts skipped (no person found or no email pattern)."
        )

    logs.append({
        "stage": "Stage 3: Contact Discovery",
        "status": status_str,
        "details": details,
    })

    return {
        "discovered_contacts": discovered_contacts,
        "discovered_contact": discovered_contacts[0] if discovered_contacts else None,
        "logs": logs,
    }
