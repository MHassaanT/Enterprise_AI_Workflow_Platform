"""
Email Pattern Engine — Infers corporate email naming conventions from discovered emails.

Given a real email found on a company's website (e.g. john.doe@acme.com), detects
the naming pattern (first.last@, flast@, first@, etc.) and applies it to a new
person's name to produce a candidate email explicitly tagged as inferred_unverified.

This module is pure logic — no API calls, no LLM, no network I/O.
"""
import re
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

# Role/generic prefixes that cannot reveal a person-name pattern
ROLE_PREFIXES = {
    "info", "contact", "support", "admin", "sales", "jobs", "careers",
    "help", "enquiries", "hello", "office", "billing", "media", "press",
    "marketing", "postmaster", "webmaster", "hostmaster", "privacy", "legal",
    "hr", "team", "general", "noreply", "no-reply", "newsletter", "feedback",
    "service", "abuse", "security", "compliance", "partners", "investor",
    "ir", "inquiries", "request", "orders", "shipping", "returns",
}

# Supported patterns in priority order for detection
PATTERN_DEFINITIONS = {
    "first.last":  lambda f, l: f"{f}.{l}",
    "first_last":  lambda f, l: f"{f}_{l}",
    "firstlast":   lambda f, l: f"{f}{l}",
    "flast":       lambda f, l: f"{f[0]}{l}" if f else "",
    "first":       lambda f, l: f,
    "lastfirst":   lambda f, l: f"{l}{f}",
    "last.first":  lambda f, l: f"{l}.{f}",
    "lfirst":      lambda f, l: f"{l[0]}{f}" if l else "",
    "last":        lambda f, l: l,
}


def _is_role_address(local_part: str) -> bool:
    """Returns True if the local part is a generic/role prefix."""
    return local_part.lower().strip() in ROLE_PREFIXES


def detect_pattern(email: str, domain: str) -> Optional[str]:
    """
    Attempts to detect the email naming pattern from a known email address.

    Works best when the local part clearly matches a common pattern
    (contains a dot separator, underscore, or is a single word that's
    clearly a first name).

    Args:
        email: A real email address found on the company website.
        domain: The company domain (used to validate the email belongs to this company).

    Returns:
        Pattern key string (e.g. "first.last", "flast", "first") or None
        if the pattern cannot be determined (role account, ambiguous, wrong domain).
    """
    if not email or "@" not in email:
        return None

    local_part, email_domain = email.rsplit("@", 1)
    local_part = local_part.lower().strip()
    email_domain = email_domain.lower().strip()

    # Must belong to the target domain
    if email_domain != domain.lower().strip():
        return None

    # Role/generic addresses cannot reveal person-name patterns
    if _is_role_address(local_part):
        return None

    # Detect by structural analysis
    if "." in local_part:
        parts = local_part.split(".")
        if len(parts) == 2 and len(parts[0]) > 1 and len(parts[1]) > 1:
            return "first.last"
        elif len(parts) == 2 and len(parts[0]) == 1 and len(parts[1]) > 1:
            # Could be f.last — treat as variant of first.last with initial
            return "first.last"

    if "_" in local_part:
        parts = local_part.split("_")
        if len(parts) == 2 and len(parts[0]) > 1 and len(parts[1]) > 1:
            return "first_last"

    # Single word — ambiguous, but we can try common patterns
    if local_part.isalpha():
        if len(local_part) <= 2:
            # Too short / ambiguous (could be initials like 'jd', 'ab')
            return None
        # 3+ letter single-word local parts are likely first names (lee, ant, max, ali, sam)
        # Default to "first" pattern
        if 3 <= len(local_part) <= 10:
            return "first"

    return None


def infer_email(first_name: str, last_name: str, domain: str, pattern: str) -> Optional[str]:
    """
    Applies a detected naming pattern to a person's name to produce a candidate email.

    Args:
        first_name: Person's first name.
        last_name: Person's last name.
        domain: Company domain.
        pattern: Pattern key from detect_pattern() (e.g. "first.last").

    Returns:
        Candidate email string, or None if inputs are insufficient.
    """
    if not first_name or not last_name or not domain or not pattern:
        return None

    first = first_name.lower().strip()
    last = last_name.lower().strip()
    domain = domain.lower().strip()

    # Remove any non-alpha characters from names (hyphens, apostrophes, etc.)
    first = re.sub(r'[^a-z]', '', first)
    last = re.sub(r'[^a-z]', '', last)

    if not first or not last:
        return None

    generator = PATTERN_DEFINITIONS.get(pattern)
    if not generator:
        logger.warning(f"[EMAIL PATTERN] Unknown pattern '{pattern}'. Cannot infer email.")
        return None

    local_part = generator(first, last)
    if not local_part:
        return None

    return f"{local_part}@{domain}"


def detect_and_infer(
    pattern_emails: List[str],
    first_name: str,
    last_name: str,
    domain: str,
) -> Optional[Dict[str, Any]]:
    """
    Convenience wrapper: tries each pattern_emails entry, picks the first non-role
    email that yields a detectable pattern, infers the candidate email, and returns
    it tagged inferred_unverified.

    Args:
        pattern_emails: List of real emails found on the company website (from Phase 2).
        first_name: Decision-maker's first name (from Serper search).
        last_name: Decision-maker's last name (from Serper search).
        domain: Company domain.

    Returns:
        Dict with keys: email, pattern_used, pattern_source_email, email_status
        or None if no pattern can be detected or inference fails.
    """
    if not pattern_emails or not first_name or not last_name or not domain:
        return None

    for source_email in pattern_emails:
        if not source_email or "@" not in source_email:
            continue

        pattern = detect_pattern(source_email, domain)
        if not pattern:
            logger.debug(f"[EMAIL PATTERN] Could not detect pattern from '{source_email}' for domain '{domain}'. Trying next.")
            continue

        candidate = infer_email(first_name, last_name, domain, pattern)
        if not candidate:
            continue

        logger.info(f"[EMAIL PATTERN] Inferred '{candidate}' using pattern '{pattern}' from source '{source_email}'")
        return {
            "email": candidate,
            "pattern_used": pattern,
            "pattern_source_email": source_email,
            "email_status": "inferred_unverified",
        }

    logger.info(f"[EMAIL PATTERN] No usable pattern detected from {len(pattern_emails)} emails for domain '{domain}'. Emails were: {pattern_emails}")
    return None
