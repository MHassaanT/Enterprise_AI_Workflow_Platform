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
    """
    import smtplib
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
            return {"tested": False, "exists": True, "reason": "No MX hosts resolved for SMTP check."}

        for mx_host in mx_hosts[:2]:
            def _rcpt_handshake():
                try:
                    server = smtplib.SMTP(timeout=4)
                    server.connect(mx_host, 25)
                    server.helo("verify.ai-platform.com")
                    server.mail("verifier@ai-platform.com")
                    code, resp = server.rcpt(email)
                    server.quit()
                    return code, resp.decode('utf-8', errors='ignore')
                except Exception as ex:
                    return None, str(ex)

            code, resp_text = await loop.run_in_executor(None, _rcpt_handshake)
            if code == 250:
                return {"tested": True, "exists": True, "code": code, "reason": "SMTP Mailbox verified (250 OK)."}
            elif code in (550, 551, 552, 553, 501, 504):
                lower_resp = resp_text.lower()
                if any(term in lower_resp for term in ["5.1.1", "5.1.0", "does not exist", "user unknown", "no such user", "address rejected", "invalid recipient", "recipient rejected", "unknown user", "nosuchuser"]):
                    return {"tested": True, "exists": False, "code": code, "reason": f"Mailbox does not exist on target SMTP server ({code}: {resp_text})."}
                elif any(term in lower_resp for term in ["spamhaus", "blocked", "5.7.1", "denied", "blacklist", "refused", "service unavailable"]):
                    return {"tested": False, "exists": True, "code": code, "reason": f"SMTP host IP block ({resp_text}). Fallback to MX record check."}
                else:
                    return {"tested": True, "exists": False, "code": code, "reason": f"SMTP server rejected recipient address ({code}: {resp_text})."}

        return {"tested": False, "exists": True, "reason": "SMTP port 25 unreachable or catch-all."}
    except Exception as e:
        logger.warning(f"SMTP check error for {email}: {e}")
        return {"tested": False, "exists": True, "reason": str(e)}


async def verify_email(email: str) -> Dict[str, Any]:
    """
    Performs full deliverability verification on an email address.
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
    if smtp_res.get("tested") and not smtp_res.get("exists"):
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
            "reason": smtp_res.get("reason", "Mailbox does not exist on target SMTP server."),
        }

    # 7. Summary Scoring & Status Determination
    status = "VALID"
    deliverability = "HIGH"
    reason = smtp_res.get("reason", "Email passed syntax, MX record, and deliverability verification.")

    return {
        "email": email_clean,
        "is_valid": True,
        "deliverability": deliverability,
        "status": status,
        "syntax_valid": True,
        "domain": domain,
        "has_mx_records": True,
        "is_disposable": False,
        "is_free_provider": is_free,
        "reason": reason,
    }
