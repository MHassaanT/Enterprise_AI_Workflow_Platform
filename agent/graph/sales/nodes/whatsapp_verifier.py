"""
Stage 3: Baileys onWhatsApp Deliverability Guard Node.
Verifies whether candidate business phone numbers are actively registered on WhatsApp
via the Baileys onWhatsApp() API check in the WhatsApp MCP service.
Completely replaces SMTP/email verification checks (RFC-5322, MX DNS, ZeroBounce).
"""
import asyncio
import logging
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from services.whatsapp_verifier import check_whatsapp_registration
from tool_gateway.places_discovery import normalize_e164_phone

logger = logging.getLogger(__name__)


async def whatsapp_verifier_node(state: SalesAgentState) -> Dict[str, Any]:
    prospect_limit = state.get("prospect_limit") or 10
    tenant_id = state.get("tenant_id", "00000000-0000-0000-0000-000000000000")
    qualified_places = list(state.get("qualified_places") or state.get("scraped_accounts") or [])
    logs = list(state.get("logs", []))

    logger.info(
        f"[STAGE 3: WHATSAPP VERIFIER] Starting Baileys onWhatsApp verification for "
        f"{len(qualified_places)} qualified candidates. Target limit={prospect_limit}."
    )

    if not qualified_places:
        logs.append({
            "stage": "Stage 3: WhatsApp Deliverability Guard",
            "status": "FAILED",
            "details": "0 qualified candidates received from Stage 2.",
        })
        return {
            "verified_prospects": [],
            "logs": logs,
            "verified_contacts": [],
        }

    async def _verify_single(place: Dict[str, Any]):
        raw_phone = place.get("contact_phone") or place.get("raw_phone")
        clean_phone = normalize_e164_phone(raw_phone)

        if not clean_phone:
            logger.info(f"[WHATSAPP GUARD] Candidate '{place.get('company_name')}' has no phone number. Skipping.")
            return None, "NO_PHONE"

        wa_res = await check_whatsapp_registration(clean_phone, tenant_id=tenant_id)
        status = wa_res.get("whatsapp_status") or wa_res.get("status", "UNVERIFIED")

        enriched = dict(place)
        enriched["contact_phone"] = clean_phone
        enriched["whatsapp_status"] = status
        enriched["whatsapp_jid"] = wa_res.get("jid")
        enriched["whatsapp_check"] = wa_res

        # Standard contact fields for CRM and frontend compatibility
        enriched["contact_name"] = place.get("company_name", "Business Owner")
        enriched["contact_title"] = place.get("target_role", "Owner / General Manager")
        enriched["outreach_channel"] = "whatsapp"

        if status == "ON_WHATSAPP":
            logger.info(f"[WHATSAPP GUARD] ✅ {place.get('company_name')} ({clean_phone}) is ON_WHATSAPP!")
            return enriched, "ON_WHATSAPP"
        else:
            logger.info(f"[WHATSAPP GUARD] ❌ {place.get('company_name')} ({clean_phone}) is NOT on WhatsApp ({status}).")
            return None, status

    # Verify all qualified candidate accounts concurrently
    results = await asyncio.gather(*[_verify_single(p) for p in qualified_places])

    verified_prospects: List[Dict[str, Any]] = []
    discarded_count = 0
    for verified_item, status_label in results:
        if verified_item:
            verified_prospects.append(verified_item)
        else:
            discarded_count += 1

    # Take up to requested prospect limit
    fulfilled_prospects = verified_prospects[:prospect_limit]

    logger.info(
        f"[STAGE 3: WHATSAPP VERIFIER] Verification complete: {len(fulfilled_prospects)} "
        f"verified ON_WHATSAPP prospects selected (evaluated {len(qualified_places)}, discarded {discarded_count})."
    )

    if fulfilled_prospects:
        status_str = "COMPLETED"
        details = (
            f"Baileys onWhatsApp() verified {len(fulfilled_prospects)} prospects actively registered on WhatsApp. "
            f"Filtered out {discarded_count} non-WhatsApp or landline numbers."
        )
    else:
        status_str = "FAILED"
        details = (
            f"Evaluated {len(qualified_places)} business phones via Baileys onWhatsApp(), but 0 were registered "
            f"on WhatsApp ({discarded_count} discarded)."
        )

    logs.append({
        "stage": "Stage 3: WhatsApp Deliverability Guard",
        "status": status_str,
        "details": details,
    })

    return {
        "verified_prospects": fulfilled_prospects,
        "logs": logs,
        # Legacy compatibility aliases
        "verified_contacts": fulfilled_prospects,
        "discovered_contacts": fulfilled_prospects,
        "discovered_contact": fulfilled_prospects[0] if fulfilled_prospects else None,
    }
