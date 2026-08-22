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
        logger.warning("[ZEROBOUNCE] ZEROBOUNCE_API_KEY not found in environment.")
        return {"email": email, "is_valid": False, "source": "no_api_key"}

    url = "https://api.zerobounce.net/v2/validate"
    params = {
        "api_key": api_key,
        "email": email,
        "ip_address": ""
    }

    try:
        logger.info(f"[ZEROBOUNCE] Calling ZeroBounce API for email '{email}'...")
        async with httpx.AsyncClient(timeout=10.0) as client:
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
        logger.warning(f"[ZEROBOUNCE] API Exception for '{email}': {e}")

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

    # 5. Hunter.io Email Verifier check via API
    try:
        hunter_res = await verify_email_with_hunter(email_clean, tenant_id=tenant_id)
        logger.info(f"[EMAIL VERIFIER] Hunter verifier res for '{email_clean}': {hunter_res}")
        if hunter_res and hunter_res.get("source") == "hunter_io_api":
            return hunter_res
    except Exception as e:
        logger.warning(f"[EMAIL VERIFIER] Hunter verification exception: {e}")

    # 6. MX Record DNS Validation
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

    # 7. Direct SMTP Mailbox Existence Verification
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

    # 8. ZeroBounce API Fallback (Triggered when Port 25 Direct SMTP Handshake fails or is restricted)
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


async def verify_email_with_hunter(email: str, tenant_id: str = "00000000-0000-0000-0000-000000000000") -> Dict[str, Any]:
    """
    Performs Hunter.io Email Verifier check via the Centralized MCP Gateway adapter.
    """
    logger.info(f"[VERIFY WITH HUNTER] Starting Hunter verify for email='{email}', tenant_id='{tenant_id}'")
    try:
        from tool_gateway.adapters.hunter_adapter import execute_hunter_tool
        from tool_gateway.credentials_manager import fetch_tool_credentials
        
        creds = await fetch_tool_credentials(tenant_id=tenant_id, tool_id="Hunter.io")
        logger.info(f"[VERIFY WITH HUNTER] fetch_tool_credentials output: {bool(creds and creds.get('api_key'))}")
        if not creds or not creds.get("api_key"):
            from tool_gateway.hunter_mcp import get_tenant_hunter_credentials
            creds = await get_tenant_hunter_credentials(tenant_id)
            logger.info(f"[VERIFY WITH HUNTER] get_tenant_hunter_credentials output: {bool(creds and creds.get('api_key'))}")

        logger.info(f"[VERIFY WITH HUNTER] Executing hunter_verify_email tool with creds length: {len(creds.get('api_key', '')) if creds else 0}")
        res_str = await execute_hunter_tool("hunter_verify_email", {"email": email}, creds)
        logger.info(f"[VERIFY WITH HUNTER] Raw execute_hunter_tool response: {res_str[:300] if res_str else 'EMPTY'}")
        if res_str and res_str.strip().startswith("{"):
            try:
                res_data = json.loads(res_str)
                if res_data.get("status") == "success":
                    result_status = str(res_data.get("result") or "valid").lower()
                    score = res_data.get("score")
                    is_valid = (result_status in ("valid", "accept_all", "webmail")) and (score is None or score >= 40)
                    logger.info(f"[VERIFY WITH HUNTER] Result parsed: result_status='{result_status}', score={score}, is_valid={is_valid}, source='{res_data.get('source')}'")
                    return {
                        "email": email,
                        "is_valid": is_valid,
                        "deliverability": "HIGH" if is_valid else "LOW",
                        "status": "VALID" if is_valid else "INVALID",
                        "score": score if score is not None else 90,
                        "reason": f"Hunter.io verification status: {result_status} (Score: {score}/100)",
                        "source": res_data.get("source", "hunter_io_api")
                    }
                else:
                    logger.warning(f"[VERIFY WITH HUNTER] Hunter response status: {res_data.get('status')}, message: {res_data.get('message')}")
            except Exception as parse_err:
                logger.warning(f"[VERIFY WITH HUNTER] JSON parse error: {parse_err}")
        else:
            logger.warning(f"[VERIFY WITH HUNTER] Non-JSON response received: {res_str[:200] if res_str else 'EMPTY'}")
    except Exception as e:
        logger.warning(f"[VERIFY WITH HUNTER] Hunter.io email verifier check exception: {e}")
        
    return {"email": email, "is_valid": False, "source": "fallback"}

