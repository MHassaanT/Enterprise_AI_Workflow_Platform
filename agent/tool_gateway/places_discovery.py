"""
Google Places API Tool Gateway.
Provides commercial B2B entity discovery via Google Places API (New)
with automated fallback to Serper Places API.

Extracts verified business records with:
- Business name (displayName)
- Direct phone number (internationalPhoneNumber in E.164 standard)
- Physical address & region
- Website & domain
- Google rating & review count
- Primary category & operating status
"""
import logging
import re
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse
import httpx
from config import settings

logger = logging.getLogger(__name__)

# Blacklist of aggregator and directory sites that are not real commercial companies
NON_COMPANY_DOMAINS = {
    "google.com", "maps.google.com", "yellowpages.com", "superpages.com",
    "whitepages.com", "manta.com", "bbb.org", "chamberofcommerce.com",
    "clutch.co", "yelp.com", "tripadvisor.com", "facebook.com", "instagram.com",
    "linkedin.com", "twitter.com", "x.com", "wikipedia.org", "foursquare.com",
}


def normalize_e164_phone(phone: Optional[str], default_country_code: str = "+92") -> Optional[str]:
    """
    Normalizes phone numbers to standard E.164 format (e.g. +923001234567, +15551234567).
    """
    if not phone:
        return None

    cleaned = "".join(c for c in str(phone) if c.isdigit() or c == "+")
    if not cleaned:
        return None

    # Handle +0 prefix (e.g. +03144351616 -> +923144351616)
    if cleaned.startswith("+0"):
        digits = cleaned[2:]
        if len(digits) == 10:
            return f"+92{digits}"
        return f"{default_country_code}{digits}"

    # If it starts with +, ensure it has sufficient digits
    if cleaned.startswith("+"):
        digits = cleaned[1:]
        if 7 <= len(digits) <= 15:
            return cleaned
        return None

    digits = cleaned
    # Leading 00 is international prefix
    if digits.startswith("00"):
        digits = digits[2:]
        if 7 <= len(digits) <= 15:
            return f"+{digits}"

    # Handle standard US 10-digit
    if len(digits) == 10 and not digits.startswith("0"):
        return f"+1{digits}"
    elif len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"

    # Handle standard Pakistan 11-digit starting with 0 (e.g. 03001234567)
    if digits.startswith("0") and len(digits) == 11:
        return f"+92{digits[1:]}"

    # Fallback with default country code if length looks like a local phone
    if 7 <= len(digits) <= 12:
        return f"{default_country_code}{digits.lstrip('0')}"

    return None


def extract_clean_domain(url_or_domain: Optional[str], company_name: str = "") -> str:
    """
    Extracts a clean root domain from a website URL.
    Falls back to a clean slug if no valid URL is provided.
    """
    if url_or_domain and isinstance(url_or_domain, str) and url_or_domain.strip():
        val = url_or_domain.strip()
        if not val.startswith("http://") and not val.startswith("https://"):
            val = "https://" + val
        try:
            parsed = urlparse(val)
            netloc = parsed.netloc.lower()
            if netloc.startswith("www."):
                netloc = netloc[4:]
            if netloc and "." in netloc and netloc not in NON_COMPANY_DOMAINS:
                return netloc
        except Exception:
            pass

    # Fallback to slug from company name
    slug = re.sub(r"[^a-zA-Z0-9]+", "", company_name).lower()
    return f"{slug or 'business'}.com"


async def search_places_discovery(
    target_industries: List[str],
    region: str = "",
    limit: int = 20,
    tenant_id: str = "00000000-0000-0000-0000-000000000000",
) -> Dict[str, Any]:
    """
    Discovers commercial businesses matching target industries and region.
    Tries Google Places API (New) first.
    If unavailable or not enabled (403), gracefully falls back to Serper Places API.
    """
    clean_industries = [i.strip() for i in target_industries if i and i.strip()]
    if not clean_industries:
        clean_industries = ["Commercial Business"]

    primary_industry = clean_industries[0]
    region_str = region.strip() if region else ""

    queries = []
    if region_str:
        for ind in clean_industries[:2]:
            queries.append(f"{ind} in {region_str}")
            queries.append(f"top {ind} businesses in {region_str}")
    else:
        for ind in clean_industries[:2]:
            queries.append(f"{ind} companies")
            queries.append(f"commercial {ind} businesses")

    discovered_places: List[Dict[str, Any]] = []
    seen_keys = set()
    places_api_used = "google_places_new"

    api_key = settings.places_api_key

    # Attempt Google Places API (New)
    google_places_success = False
    if api_key:
        for query in queries[:2]:
            if len(discovered_places) >= limit * 2:
                break
            try:
                url = "https://places.googleapis.com/v1/places:searchText"
                headers = {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": api_key,
                    "X-Goog-FieldMask": (
                        "places.id,places.displayName,places.formattedAddress,"
                        "places.nationalPhoneNumber,places.internationalPhoneNumber,"
                        "places.websiteUri,places.rating,places.userRatingCount,"
                        "places.businessStatus,places.types,places.primaryType"
                    ),
                }
                body = {
                    "textQuery": query,
                    "maxResultCount": min(limit, 20),
                    "languageCode": "en",
                }

                async with httpx.AsyncClient(timeout=12.0) as client:
                    resp = await client.post(url, headers=headers, json=body)
                    if resp.status_code == 200:
                        google_places_success = True
                        data = resp.json()
                        for p in data.get("places", []):
                            status = p.get("businessStatus", "OPERATIONAL")
                            if status in ["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"]:
                                continue

                            display_name = p.get("displayName", {}).get("text", "")
                            if not display_name:
                                continue

                            raw_phone = p.get("internationalPhoneNumber") or p.get("nationalPhoneNumber")
                            phone = normalize_e164_phone(raw_phone)
                            website_uri = p.get("websiteUri", "")
                            domain = extract_clean_domain(website_uri, display_name)

                            key = f"{display_name.lower()}::{phone or domain}"
                            if key in seen_keys:
                                continue
                            seen_keys.add(key)

                            discovered_places.append({
                                "company_name": display_name,
                                "domain": domain,
                                "website_uri": website_uri,
                                "contact_phone": phone,
                                "raw_phone": raw_phone,
                                "address": p.get("formattedAddress", ""),
                                "google_rating": float(p.get("rating", 0.0) or 0.0),
                                "review_count": int(p.get("userRatingCount", 0) or 0),
                                "category": p.get("primaryType") or (p.get("types") or ["business"])[0],
                                "place_id": p.get("id", ""),
                                "business_status": status,
                                "source": "google_places_api_new",
                                "industry": primary_industry,
                            })
                    else:
                        logger.warning(
                            f"[PLACES TOOL] Google Places API (New) returned {resp.status_code}: {resp.text[:150]}. "
                            "Will fall back to Serper Places."
                        )
                        break
            except Exception as e:
                logger.warning(f"[PLACES TOOL] Error querying Google Places API (New): {e}")
                break

    # Fallback to Serper Places if Google Places was not used or yielded 0 places
    if not google_places_success or not discovered_places:
        places_api_used = "serper_places_fallback"
        serper_key = settings.SERPER_API_KEY
        if serper_key:
            for query in queries[:2]:
                if len(discovered_places) >= limit * 2:
                    break
                try:
                    url = "https://google.serper.dev/places"
                    headers = {
                        "X-API-KEY": serper_key,
                        "Content-Type": "application/json",
                    }
                    body = {
                        "q": query,
                        "num": min(limit, 20),
                    }
                    async with httpx.AsyncClient(timeout=12.0) as client:
                        resp = await client.post(url, headers=headers, json=body)
                        if resp.status_code == 200:
                            data = resp.json()
                            for p in data.get("places", []):
                                title = p.get("title", "")
                                if not title:
                                    continue

                                raw_phone = p.get("phoneNumber")
                                phone = normalize_e164_phone(raw_phone)
                                website_uri = p.get("website", "")
                                domain = extract_clean_domain(website_uri, title)

                                key = f"{title.lower()}::{phone or domain}"
                                if key in seen_keys:
                                    continue
                                seen_keys.add(key)

                                discovered_places.append({
                                    "company_name": title,
                                    "domain": domain,
                                    "website_uri": website_uri,
                                    "contact_phone": phone,
                                    "raw_phone": raw_phone,
                                    "address": p.get("address", ""),
                                    "google_rating": float(p.get("rating", 0.0) or 0.0),
                                    "review_count": int(p.get("ratingCount", 0) or 0),
                                    "category": p.get("category") or primary_industry,
                                    "place_id": str(p.get("cid") or ""),
                                    "business_status": "OPERATIONAL",
                                    "source": "serper_places",
                                    "industry": primary_industry,
                                })
                except Exception as e:
                    logger.warning(f"[PLACES TOOL] Error querying Serper Places fallback: {e}")

    # For top candidates lacking phone numbers, resolve via Serper company search
    async def _resolve_missing_phone(place: Dict[str, Any]):
        if not place.get("contact_phone"):
            try:
                from tool_gateway.search_discovery import search_company_phone
                p_resolved = await search_company_phone(
                    company_name=place.get("company_name", ""),
                    domain=place.get("domain", ""),
                    tenant_id=tenant_id
                )
                if p_resolved:
                    place["contact_phone"] = p_resolved
            except Exception:
                pass

    # Resolve phones in parallel for top candidates without phones
    missing_phone_places = [p for p in discovered_places if not p.get("contact_phone")][:limit * 2]
    if missing_phone_places:
        import asyncio
        await asyncio.gather(*[_resolve_missing_phone(p) for p in missing_phone_places])

    # Prioritize places with direct phone numbers and higher Google ratings
    discovered_places.sort(
        key=lambda p: (
            bool(p.get("contact_phone")),
            p.get("google_rating", 0.0),
            p.get("review_count", 0),
        ),
        reverse=True,
    )

    logger.info(
        f"[PLACES TOOL] Discovered {len(discovered_places)} commercial places via {places_api_used} "
        f"for industries={clean_industries}, region='{region_str}'"
    )

    return {
        "places": discovered_places,
        "total_found": len(discovered_places),
        "api_used": places_api_used,
        "query_used": queries[0] if queries else "",
    }
