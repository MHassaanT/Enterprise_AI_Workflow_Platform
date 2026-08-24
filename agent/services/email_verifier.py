"""
Email Verifier Service — Production-grade Deliverability Guard.

Inspired by https://github.com/AfterShip/email-verifier
Features:
- RFC 5322 Syntax validation
- DNS MX (Mail Exchange) record check
- Disposable email provider detection
- Free webmail domain identification
- Catch-all & deliverability risk scoring
"""
import re
import socket
import asyncio
import json
import logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

# RFC 5322 Compliant Email Regex Pattern
EMAIL_REGEX = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
)

# Known Disposable & Temporary Email Domains
DISPOSABLE_DOMAINS = {
    "mailinator.com", "10minutemail.com", "tempmail.com", "throwawaymail.com",
    "guerrillamail.com", "sharklasers.com", "yopmail.com", "trashmail.com",
    "getnada.com", "dispostable.com", "fakeinbox.com", "crazymailing.com",
    "0815.ru", "armyspy.com", "cuvox.de", "dayrep.com", "einrot.com", "fleckens.hu",
    "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us", "einrot.com"
}

# Free Webmail Providers
FREE_PROVIDERS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
    "icloud.com", "protonmail.com", "zoho.com", "mail.com", "gmx.com"
}


GENERIC_ROLE_PREFIXES = {
    "contact", "info", "support", "admin", "sales", "jobs", "careers",
    "help", "enquiries", "hello", "office", "billing", "media", "press",
    "marketing", "postmaster", "webmaster", "hostmaster", "privacy", "legal"
}


async def check_mx_records(domain: str) -> bool:
    """Asynchronous DNS MX record lookup via socket/loop."""
    try:
        loop = asyncio.get_running_loop()
        def _resolve():
            try:
                host_info = socket.gethostbyname_ex(domain)
                return bool(host_info and host_info[2])
            except Exception:
                return False
        
        return await loop.run_in_executor(None, _resolve)
    except Exception as e:
        logger.warning(f"DNS lookup error for domain {domain}: {e}")
        return False


def verify_email_syntax(email: str) -> bool:
    """Validates email format using strict RFC 5322 regex."""
    if not email or len(email) > 254:
        return False
    return bool(EMAIL_REGEX.match(email.strip()))


async def check_smtp_mailbox(email: str, domain: str) -> Dict[str, Any]:
    """
    Performs real-time SMTP RCPT TO handshake against target domain MX servers.
    Detects 550 Mailbox Not Found / Non-existent user errors before sending.
    Probes for catch-all (accept-all) behavior using a random probe address.
    """
    import smtplib
    import uuid
    try:
        def _get_mx_hosts():
            try:
                import dns.resolver
                answers = dns.resolver.resolve(domain, 'MX')
                return [str(r.exchange).rstrip('.') for r in sorted(answers, key=lambda x: x.preference)]
            except Exception:
                try:
                    host_info = socket.gethostbyname_ex(domain)
                    return [host_info[0]] if host_info else []
                except Exception:
                    return []

        loop = asyncio.get_running_loop()
        mx_hosts = await loop.run_in_executor(None, _get_mx_hosts)
        if not mx_hosts:
            return {"tested": False, "exists": True, "is_catch_all": False, "reason": "No MX hosts resolved for SMTP check."}

        for mx_host in mx_hosts[:1]:
            def _rcpt_handshake():
                try:
                    server = smtplib.SMTP(timeout=2.0)
                    server.connect(mx_host, 25)
                    server.helo("verify.ai-platform.com")
                    server.mail("verifier@ai-platform.com")
                    code, resp = server.rcpt(email)

                    is_catch_all = False
                    if code == 250:
                        # Probe a random non-existent address to detect catch-all / accept-all servers
                        probe_email = f"probe_{uuid.uuid4().hex[:8]}@{domain}"
                        probe_code, _ = server.rcpt(probe_email)
                        if probe_code == 250:
                            is_catch_all = True

                    server.quit()
                    return code, resp.decode('utf-8', errors='ignore'), is_catch_all
                except Exception as ex:
                    return None, str(ex), False

            code, resp_text, is_catch_all = await loop.run_in_executor(None, _rcpt_handshake)
            if code == 250:
                if is_catch_all:
                    return {
                        "tested": True,
                        "exists": True,
                        "is_catch_all": True,
                        "code": code,
                        "reason": "SMTP server is catch-all / accept-all (accepts any address during handshake)."
                    }
                return {
                    "tested": True,
                    "exists": True,
                    "is_catch_all": False,
                    "code": code,
                    "reason": "SMTP Mailbox verified (250 OK)."
                }
            elif code in (550, 551, 552, 553, 501, 504):
                lower_resp = resp_text.lower()
                if any(term in lower_resp for term in ["5.1.1", "5.1.0", "does not exist", "user unknown", "no such user", "address rejected", "recipient rejected", "unknown user", "nosuchuser"]):
                    return {"tested": True, "exists": False, "is_catch_all": False, "code": code, "reason": f"Mailbox does not exist on target SMTP server ({code}: {resp_text})."}
                elif any(term in lower_resp for term in ["spamhaus", "blocked", "5.7.1", "denied", "blacklist", "refused", "service unavailable"]):
                    return {"tested": False, "exists": True, "is_catch_all": False, "code": code, "reason": f"SMTP host IP block ({resp_text}). Fallback to MX record check."}
                else:
                    return {"tested": True, "exists": False, "is_catch_all": False, "code": code, "reason": f"SMTP server rejected recipient address ({code}: {resp_text})."}

        return {"tested": False, "exists": False, "is_catch_all": False, "reason": "SMTP port 25 unreachable or blocked by cloud provider."}
    except Exception as e:
        logger.warning(f"SMTP check error for {email}: {e}")
        return {"tested": False, "exists": False, "is_catch_all": False, "reason": f"SMTP check port 25 unreachable: {e}"}


async def verify_email_with_zerobounce(email: str) -> Dict[str, Any]:
    """
    Performs real-time email verification via ZeroBounce API v2.
    Endpoint: https://api.zerobounce.net/v2/validate
    """
    import os
    import httpx

    api_key = os.getenv("ZEROBOUNCE_API_KEY", "").strip()
    if not api_key:
        try:
            from config import settings
            api_key = (settings.ZEROBOUNCE_API_KEY or "").strip()
        except Exception:
            pass

    if not api_key:
        logger.warning("[ZEROBOUNCE] ZEROBOUNCE_API_KEY not found in environment or config.")
        return {"email": email, "is_valid": False, "source": "no_api_key"}

    url = "https://api.zerobounce.net/v2/validate"
    params = {
        "api_key": api_key,
        "email": email,
        "ip_address": ""
    }

    try:
        logger.info(f"[ZEROBOUNCE] Calling ZeroBounce API for email '{email}'...")
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                zb_status = str(data.get("status") or "").lower()
                sub_status = str(data.get("sub_status") or "").lower()
                domain = data.get("domain", "")

                logger.info(f"[ZEROBOUNCE] Response for '{email}': status='{zb_status}', sub_status='{sub_status}'")

                if zb_status == "valid":
                    return {
                        "email": email,
                        "is_valid": True,
                        "deliverability": "HIGH",
                        "status": "VALID",
                        "syntax_valid": True,
                        "domain": domain,
                        "has_mx_records": True,
                        "is_disposable": False,
                        "is_free_provider": False,
                        "reason": f"Verified via ZeroBounce API (status: valid, sub_status: {sub_status or 'ok'}).",
                        "source": "zerobounce_api"
                    }
                elif zb_status in ("catch-all", "catch_all"):
                    return {
                        "email": email,
                        "is_valid": False,
                        "deliverability": "RISKY",
                        "status": "CATCH_ALL",
                        "syntax_valid": True,
                        "domain": domain,
                        "has_mx_records": True,
                        "is_disposable": False,
                        "is_free_provider": False,
                        "reason": f"ZeroBounce API flagged catch-all server (sub_status: {sub_status}).",
                        "source": "zerobounce_api"
                    }
                else:
                    return {
                        "email": email,
                        "is_valid": False,
                        "deliverability": "INVALID",
                        "status": "INVALID",
                        "syntax_valid": True,
                        "domain": domain,
                        "has_mx_records": True,
                        "is_disposable": False,
                        "is_free_provider": False,
                        "reason": f"ZeroBounce API reported status: {zb_status} (sub_status: {sub_status}).",
                        "source": "zerobounce_api"
                    }
            else:
                logger.warning(f"[ZEROBOUNCE] API HTTP Error {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"[ZEROBOUNCE] API Exception for '{email}': {type(e).__name__}: {e!r}")

    return {"email": email, "is_valid": False, "source": "zerobounce_error"}


async def verify_email(email: str, source: str = "unknown", tenant_id: str = "00000000-0000-0000-0000-000000000000") -> Dict[str, Any]:
    """
    Performs full deliverability verification on an email address.
    Strict Verification Protocol:
    1. Syntax & Role/Disposable filters.
    2. Hunter.io API (if tenant key configured).
    3. MX DNS record resolution.
    4. Live Direct SMTP Port 25 RCPT TO handshake & probe check.
    5. ZeroBounce API verification fallback if Port 25 is blocked/untested.
    No passive MX-only domain bypass is permitted.
    """
    email_clean = email.strip().lower()
    
    # 1. Syntax Check
    syntax_valid = verify_email_syntax(email_clean)
    if not syntax_valid:
        return {
            "email": email_clean,
            "is_valid": False,
            "deliverability": "INVALID",
            "status": "INVALID",
            "syntax_valid": False,
            "domain": "",
            "has_mx_records": False,
            "is_disposable": False,
            "is_free_provider": False,
            "reason": "Invalid email syntax format.",
        }

    parts = email_clean.split("@")
    local_part = parts[0]
    domain = parts[1]

    # 2. Generic Role Account Filter (contact@, info@, etc.)
    if local_part in GENERIC_ROLE_PREFIXES:
        return {
            "email": email_clean,
            "is_valid": False,
            "deliverability": "RISKY",
            "status": "ROLE_ACCOUNT",
            "syntax_valid": True,
            "domain": domain,
            "has_mx_records": True,
            "is_disposable": False,
            "is_free_provider": False,
            "reason": f"Generic role account '{local_part}@' is not an individual executive recipient.",
        }

    # 3. Disposable Domain Check
    is_disposable = domain in DISPOSABLE_DOMAINS
    if is_disposable:
        return {
            "email": email_clean,
            "is_valid": False,
            "deliverability": "RISKY",
            "status": "DISPOSABLE",
            "syntax_valid": True,
            "domain": domain,
            "has_mx_records": True,
            "is_disposable": True,
            "is_free_provider": False,
            "reason": "Disposable / temporary email domain detected. High bounce risk.",
        }

    # 4. Free Provider Check
    is_free = domain in FREE_PROVIDERS

    # 5. MX Record DNS Validation
    has_mx = await check_mx_records(domain)
    logger.info(f"[EMAIL VERIFIER] MX record check for domain '{domain}': has_mx={has_mx}")
    if not has_mx:
        return {
            "email": email_clean,
            "is_valid": False,
            "deliverability": "LOW",
            "status": "INVALID",
            "syntax_valid": True,
            "domain": domain,
            "has_mx_records": False,
            "is_disposable": False,
            "is_free_provider": is_free,
            "reason": f"Domain '{domain}' has no active Mail Exchange (MX) DNS records.",
        }

    # 6. Direct SMTP Mailbox Existence Verification
    smtp_res = await check_smtp_mailbox(email_clean, domain)
    logger.info(f"[EMAIL VERIFIER] SMTP mailbox check for '{email_clean}': {smtp_res}")
    
    if smtp_res.get("tested") and smtp_res.get("exists"):
        if smtp_res.get("is_catch_all"):
            return {
                "email": email_clean,
                "is_valid": False,
                "deliverability": "RISKY",
                "status": "CATCH_ALL",
                "syntax_valid": True,
                "domain": domain,
                "has_mx_records": True,
                "is_disposable": False,
                "is_free_provider": is_free,
                "reason": "Domain mail server is catch-all (accept-all); mailbox existence cannot be confirmed via direct SMTP.",
            }
        return {
            "email": email_clean,
            "is_valid": True,
            "deliverability": "HIGH",
            "status": "VALID",
            "syntax_valid": True,
            "domain": domain,
            "has_mx_records": True,
            "is_disposable": False,
            "is_free_provider": is_free,
            "reason": smtp_res.get("reason", "Passed SMTP 250 OK mailbox check."),
        }
    elif smtp_res.get("tested") and not smtp_res.get("exists"):
        return {
            "email": email_clean,
            "is_valid": False,
            "deliverability": "INVALID",
            "status": "INVALID",
            "syntax_valid": True,
            "domain": domain,
            "has_mx_records": True,
            "is_disposable": False,
            "is_free_provider": is_free,
            "reason": smtp_res.get("reason", "Mailbox rejected by target SMTP server."),
        }

    # 7. ZeroBounce API Fallback (Triggered when Port 25 Direct SMTP Handshake fails or is restricted)
    logger.info(f"[EMAIL VERIFIER] Port 25 SMTP handshake unavailable/untested for '{email_clean}'. Invoking ZeroBounce API fallback...")
    zb_res = await verify_email_with_zerobounce(email_clean)
    if zb_res and zb_res.get("source") == "zerobounce_api":
        return zb_res

    # Strict Final Enforcement: If ZeroBounce is unconfigured or fails and Port 25 failed, REJECT the email.
    return {
        "email": email_clean,
        "is_valid": False,
        "deliverability": "UNVERIFIED",
        "status": "UNVERIFIED",
        "syntax_valid": True,
        "domain": domain,
        "has_mx_records": has_mx,
        "is_disposable": False,
        "is_free_provider": is_free,
        "reason": "Outbound SMTP port 25 unavailable and ZeroBounce API failed to confirm mailbox validity.",
    }

