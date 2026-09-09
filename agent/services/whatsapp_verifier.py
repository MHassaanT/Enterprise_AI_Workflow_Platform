"""
WhatsApp Verifier Service — Baileys onWhatsApp() registration check.
Communicates with the backend's embedded WhatsApp MCP module.
"""
import logging
from typing import Dict, Any, Optional
import httpx
from config import settings

logger = logging.getLogger(__name__)


async def check_whatsapp_registration(
    phone: str,
    tenant_id: str = "00000000-0000-0000-0000-000000000000",
) -> Dict[str, Any]:
    """
    Checks if a phone number is registered on WhatsApp using Baileys onWhatsApp() via backend.

    Returns:
        Dict with keys:
            - checked: bool
            - exists: bool
            - jid: Optional[str]
            - status: "ON_WHATSAPP" | "NOT_ON_WHATSAPP" | "NOT_CONNECTED" | "ERROR"
            - reason: str
    """
    if not phone:
        return {
            "checked": False,
            "exists": False,
            "is_registered": False,
            "jid": None,
            "status": "NOT_ON_WHATSAPP",
            "whatsapp_status": "NOT_ON_WHATSAPP",
            "reason": "Missing phone number.",
        }

    clean_phone = "".join(c for c in str(phone) if c.isdigit() or c == "+")
    if not clean_phone or len(clean_phone.replace("+", "")) < 7:
        return {
            "checked": False,
            "exists": False,
            "is_registered": False,
            "jid": None,
            "status": "NOT_ON_WHATSAPP",
            "whatsapp_status": "NOT_ON_WHATSAPP",
            "reason": f"Invalid phone format: '{phone}'.",
        }

    url = f"{settings.BACKEND_URL}/internal/whatsapp/check"
    headers = {
        "Content-Type": "application/json",
        "X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN,
    }
    payload = {
        "tenantId": tenant_id,
        "phone": clean_phone,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, json=payload, headers=headers)

            if not res.is_success:
                err_text = res.text
                if "does not have an active connected WhatsApp session" in err_text or "Connect first" in err_text:
                    logger.warning(f"[WHATSAPP VERIFIER] WhatsApp not paired for tenant {tenant_id}.")
                    return {
                        "checked": False,
                        "exists": False,
                        "is_registered": False,
                        "jid": None,
                        "status": "NOT_CONNECTED",
                        "whatsapp_status": "NOT_CONNECTED",
                        "reason": "WhatsApp integration is not paired in the Integration Hub.",
                    }
                return {
                    "checked": False,
                    "exists": False,
                    "is_registered": False,
                    "jid": None,
                    "status": "ERROR",
                    "whatsapp_status": "ERROR",
                    "reason": f"WhatsApp API check error ({res.status_code}): {err_text}",
                }

            data = res.json()
            results = data.get("results", [])
            matched = next((r for r in results if r.get("exists")), None)

            if matched:
                jid = matched.get("jid")
                logger.info(f"[WHATSAPP VERIFIER] ✅ {clean_phone} is registered on WhatsApp ({jid})")
                return {
                    "checked": True,
                    "exists": True,
                    "is_registered": True,
                    "jid": jid,
                    "status": "ON_WHATSAPP",
                    "whatsapp_status": "ON_WHATSAPP",
                    "reason": "Verified on WhatsApp via Baileys onWhatsApp().",
                }
            else:
                logger.info(f"[WHATSAPP VERIFIER] ❌ {clean_phone} is NOT registered on WhatsApp.")
                return {
                    "checked": True,
                    "exists": False,
                    "is_registered": False,
                    "jid": None,
                    "status": "NOT_ON_WHATSAPP",
                    "whatsapp_status": "NOT_ON_WHATSAPP",
                    "reason": "Phone number is not registered on WhatsApp.",
                }

    except Exception as e:
        logger.warning(f"[WHATSAPP VERIFIER] Check exception for {clean_phone}: {e}")
        return {
            "checked": False,
            "exists": False,
            "is_registered": False,
            "jid": None,
            "status": "ERROR",
            "whatsapp_status": "ERROR",
            "reason": f"WhatsApp check exception: {str(e)}",
        }
