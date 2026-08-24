"""
Search Discovery Adapter — Serper.dev Search API integration for B2B company discovery.

Replaces Hunter.io Discover/Domain Search for Stage 1 company sourcing.
Uses the Serper.dev Google Search JSON API to find companies matching ICP criteria.

Credential resolution order:
1. Per-tenant: fetch_tool_credentials(tenant_id, tool_id="Serper")
2. Environment: SERPER_API_KEY in config / .env
3. If none found → returns empty result with clear reason (NEVER returns synthetic data)
"""
import os
import logging
from typing import Dict, Any, List, Optional, Set
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# Serper.dev API endpoint
SERPER_API_URL = "https://google.serper.dev/search"

# Domains that are never company websites — filtered from search results
NON_COMPANY_DOMAINS = {
    # Social media
    "linkedin.com", "twitter.com", "x.com", "facebook.com", "instagram.com",
    "tiktok.com", "pinterest.com", "threads.net",
    # Reference / aggregator / directories
    "wikipedia.org", "wikidata.org", "crunchbase.com", "glassdoor.com", "glassdoor.co.in", "glassdoor.co.uk",
    "indeed.com", "yelp.com", "trustpilot.com", "g2.com", "capterra.com",
    "getapp.com", "trustradius.com", "sourceforge.net", "dnb.com", "ensun.io",
    "zoominfo.com", "lusha.com", "d7leadfinder.com", "mustakbil.com", "urdupoint.com",
    "f6s.com", "scribd.com", "pakistanies.com", "builtin.com", "builtinnyc.com",
    "builtincolorado.com", "builtinchicago.org", "project-equity.org", "partnerslate.com",
    "becomingemployeeowned.org", "companiesmarketcap.com", "foodindustry.com",
    "ziprecruiter.com", "hcareers.com", "retailbakersofamerica.org", "m.careersinfood.com",
    "gusto.com", "eposnow.com", "amtrustfinancial.com", "workstream.us",
    "completepayrollsolutions.com", "restaurant.org", "onpay.com", "tracxn.com",
    "tripadvisor.com", "foodpanda.pk", "zomato.com", "bebee.com", "pakbusinessworld.com",
    "scientificpakistan.com", "businesslist.pk", "angelinvestmentnetwork.com.pk",
    "wanderlog.com", "olx.com.pk", "smergers.com", "waystax.com", "invest.gov.pk",
    "berkeleyme.com", "thelandofpurepeople.com", "lookup.pk", "rentechdigital.com", "aeroleads.com",
    "reap.com.pk", "sunday.com.pk", "myschooladvisor.com.au", "facebook.com", "instagram.com",
    # News / content
    "youtube.com", "reddit.com", "medium.com", "substack.com", "quora.com",
    "techcrunch.com", "forbes.com", "bloomberg.com", "reuters.com",
    "wsj.com", "nytimes.com", "bbc.com", "cnn.com",
    # Dev / code hosting
    "github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com",
    "npmjs.com", "pypi.org",
    # Gov / edu
    "gov", "edu", "mil",
    # App stores
    "apps.apple.com", "play.google.com",
    # Generic platforms
    "google.com", "bing.com", "yahoo.com", "amazon.com", "ebay.com",
    "walmart.com", "target.com",
}

# Query templates — populated from ICP config, NOT hardcoded industries/regions
QUERY_TEMPLATES = [
    "{industry} company in {region}",
    "{industry} business in {region}",
    "best {industry} in {region}",
    "{industry} brand in {region}",
    "{industry} factory in {region}",
    "{industry} companies {size_hint} employees {region}",
]


def _build_size_hint(company_size_min: int, company_size_max: int) -> str:
    """Builds a human-readable size hint string from min/max headcount."""
    if company_size_min <= 10 and company_size_max >= 1000:
        return ""  # Too broad to be useful as a search filter
    if company_size_max <= 50:
        return "small"
    elif company_size_max <= 200:
        return "50-200"
    elif company_size_max <= 500:
        return "mid-size"
    elif company_size_max <= 1000:
        return "mid-market"
    else:
        return "enterprise"


def _extract_domain(url: str) -> Optional[str]:
    """Extracts a clean domain from a URL, filtering out non-company domains."""
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower().strip()
        if not host:
            return None

        # Remove www. prefix
        if host.startswith("www."):
            host = host[4:]

        # Filter out known non-company domains
        for blocked in NON_COMPANY_DOMAINS:
            if host == blocked or host.endswith("." + blocked):
                return None

        # Must have at least one dot (valid domain)
        if "." not in host:
            return None

        # Filter out IP addresses
        parts = host.split(".")
        if all(p.isdigit() for p in parts):
            return None

        return host
    except Exception:
        return None


def _build_queries(
    target_industries: List[str],
    company_size_min: int,
    company_size_max: int,
    region: Optional[str] = None,
) -> List[str]:
    """
    Builds 3-5 query variants from ICP config fields.
    Uses no hardcoded industries or regions — everything comes from the ICP.
    """
    size_hint = _build_size_hint(company_size_min, company_size_max)
    region_str = region.strip() if region else ""

    queries = []
    for industry in target_industries[:5]:  # Allow up to 5 target industries
        industry = industry.strip()
        if not industry:
            continue

        # Pick 2 template variants per industry
        templates_to_use = QUERY_TEMPLATES[:2] if len(target_industries) > 1 else QUERY_TEMPLATES[:3]

        for template in templates_to_use:
            query = template.format(
                industry=industry,
                size_hint=size_hint,
                region=region_str,
            )
            # Clean up double spaces from empty substitutions
            query = " ".join(query.split())
            queries.append(query)

    # De-duplicate while preserving order
    seen = set()
    unique_queries = []
    for q in queries:
        if q not in seen:
            seen.add(q)
            unique_queries.append(q)

    return unique_queries[:10]  # Cap at 10 queries


async def _get_serper_api_key(tenant_id: str) -> Optional[str]:
    """
    Resolves Serper.dev API key via tenant credentials or environment.
    Returns None if no key is configured.
    """
    # 1. Per-tenant credential lookup
    try:
        from tool_gateway.credentials_manager import fetch_tool_credentials
        creds = await fetch_tool_credentials(tenant_id=tenant_id, tool_id="Serper")
        if creds and (creds.get("api_key") or creds.get("secret_key")):
            key = (creds.get("api_key") or creds.get("secret_key") or "").strip()
            if len(key) >= 5:
                logger.info(f"[SEARCH DISCOVERY] ✅ Found Serper API key via tenant credentials")
                return key
    except Exception as e:
        logger.debug(f"[SEARCH DISCOVERY] Tenant credential lookup skipped: {e}")

    # 2. Environment / config
    try:
        from config import settings
        if settings.SERPER_API_KEY and len(settings.SERPER_API_KEY.strip()) >= 5:
            logger.info(f"[SEARCH DISCOVERY] ✅ Found Serper API key from config/env")
            return settings.SERPER_API_KEY.strip()
    except Exception:
        pass

    env_key = os.getenv("SERPER_API_KEY", "").strip()
    if env_key and len(env_key) >= 5:
        logger.info(f"[SEARCH DISCOVERY] ✅ Found Serper API key from SERPER_API_KEY env var")
        return env_key

    return None


async def _execute_serper_search(api_key: str, query: str, num_results: int = 20) -> Dict[str, Any]:
    """
    Executes a single Serper.dev search query. Returns raw JSON response.
    Raises on HTTP errors — caller handles fallback.
    """
    headers = {
        "X-API-KEY": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "q": query,
        "num": num_results,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(SERPER_API_URL, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()


async def search_company_accounts(
    tenant_id: str,
    target_industries: List[str],
    company_size_min: int = 10,
    company_size_max: int = 1000,
    limit: int = 20,
    exclude_domains: Optional[List[str]] = None,
    region: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Discovers candidate company domains by searching the web via Serper.dev API.

    This is the Phase 1 replacement for search_hunter_accounts_impl().
    It queries for companies matching the tenant's ICP and returns real search-derived
    company domains. NEVER returns hardcoded, synthetic, or placeholder data.

    Args:
        tenant_id: Tenant UUID for credential resolution
        target_industries: Industry names from icp_config
        company_size_min: Minimum employee headcount from ICP
        company_size_max: Maximum employee headcount from ICP
        limit: Maximum accounts to return
        exclude_domains: Domains to exclude (already targeted)
        region: Geographic region from ICP (optional)

    Returns:
        Dict with keys: status, source, accounts, reason, queries_executed
    """
    excluded_set: Set[str] = {d.strip().lower() for d in (exclude_domains or []) if d}

    # 1. Resolve API key
    api_key = await _get_serper_api_key(tenant_id)
    if not api_key:
        reason = f"No Serper API key configured for tenant '{tenant_id}'. Set SERPER_API_KEY env var or configure via Integration Hub."
        logger.warning(f"[SEARCH DISCOVERY] {reason}")
        return {
            "status": "no_results",
            "source": "serper_search_api",
            "accounts": [],
            "reason": reason,
            "queries_executed": [],
        }

    # 2. Build query variants from ICP config
    if not target_industries:
        reason = "No target_industries specified in ICP config. Cannot build search queries."
        logger.warning(f"[SEARCH DISCOVERY] {reason}")
        return {
            "status": "no_results",
            "source": "serper_search_api",
            "accounts": [],
            "reason": reason,
            "queries_executed": [],
        }

    queries = _build_queries(target_industries, company_size_min, company_size_max, region)
    logger.info(f"[SEARCH DISCOVERY] Built {len(queries)} query variants from ICP: {queries}")

    # 3. Execute searches and collect domains
    all_domains: Dict[str, Dict[str, Any]] = {}  # domain -> account record
    queries_executed: List[str] = []
    total_raw_results = 0

    for query in queries:
        try:
            result = await _execute_serper_search(api_key, query, num_results=40)
            queries_executed.append(query)

            organic = result.get("organic", [])
            total_raw_results += len(organic)

            for item in organic:
                link = item.get("link", "")
                domain = _extract_domain(link)
                if not domain:
                    continue
                if domain in excluded_set:
                    continue
                if domain in all_domains:
                    continue  # Already collected from a previous query

                # Derive company name from search title or domain
                title = item.get("title", "")
                snippet = item.get("snippet", "")

                # Infer company name: prefer title text, clean up suffixes
                company_name = title.split(" - ")[0].split(" | ")[0].split(" — ")[0].strip()
                if not company_name or len(company_name) > 80:
                    company_name = domain.split(".")[0].title()

                # Determine which industry query matched this result
                matched_industry = target_industries[0]
                for ind in target_industries:
                    if ind.lower() in query.lower():
                        matched_industry = ind
                        break

                all_domains[domain] = {
                    "company_name": company_name,
                    "domain": domain,
                    "industry": matched_industry,
                    "estimated_num_employees": f"{company_size_min}-{company_size_max}",
                    "source": "serper_search_api",
                    "search_snippet": snippet[:300] if snippet else "",
                }

                if len(all_domains) >= limit:
                    break

        except httpx.HTTPStatusError as e:
            logger.error(f"[SEARCH DISCOVERY] Serper API returned HTTP {e.response.status_code} for query '{query}': {e.response.text[:200]}")
            if e.response.status_code == 401:
                return {
                    "status": "error",
                    "source": "serper_search_api",
                    "accounts": [],
                    "reason": f"Serper API key is invalid (HTTP 401). Please check your SERPER_API_KEY configuration.",
                    "queries_executed": queries_executed,
                }
            elif e.response.status_code == 429:
                logger.warning(f"[SEARCH DISCOVERY] Rate limited by Serper API. Stopping further queries.")
                break  # Stop querying but return whatever we have so far
            # For other errors, continue to next query
            continue

        except httpx.ConnectError as e:
            logger.error(f"[SEARCH DISCOVERY] Connection error to Serper API: {e}")
            return {
                "status": "error",
                "source": "serper_search_api",
                "accounts": [],
                "reason": f"Search API connection error: {e}",
                "queries_executed": queries_executed,
            }

        except Exception as e:
            logger.error(f"[SEARCH DISCOVERY] Unexpected error executing search query '{query}': {e}")
            continue  # Try next query

        if len(all_domains) >= limit:
            break

    # 4. Build final accounts list
    accounts = list(all_domains.values())[:limit]

    if not accounts:
        reason = f"Search returned {total_raw_results} results but 0 usable company domains after filtering (queries: {queries_executed})"
        logger.info(f"[SEARCH DISCOVERY] {reason}")
        return {
            "status": "no_results",
            "source": "serper_search_api",
            "accounts": [],
            "reason": reason,
            "queries_executed": queries_executed,
        }

    logger.info(f"[SEARCH DISCOVERY] ✅ Found {len(accounts)} candidate company domains from {len(queries_executed)} queries ({total_raw_results} raw results)")
    return {
        "status": "success",
        "source": "serper_search_api",
        "accounts": accounts,
        "reason": "",
        "queries_executed": queries_executed,
    }


# ---------------------------------------------------------------------------
# Contact Person Search — Phase 3
# ---------------------------------------------------------------------------

# Query templates for finding named decision-makers
PERSON_QUERY_TEMPLATES = [
    "{company_name} {title} site:{domain}",       # Company's own site first
    "{company_name} {title}",                       # Broader web (press, conf bios)
    "{company_name} {title} team OR leadership OR about",  # About/team pages
]


async def search_contact_person(
    tenant_id: str,
    company_name: str,
    domain: str,
    target_titles: List[str],
) -> Dict[str, Any]:
    """
    Searches for a named decision-maker at a company using Serper search API.

    Reads names/titles from public search snippets (company bios, press releases,
    conference speakers). If a LinkedIn URL appears in results, uses the search
    snippet text only — does NOT fetch the LinkedIn page itself.

    Args:
        tenant_id: Tenant UUID for credential resolution.
        company_name: Company name to search for.
        domain: Company domain (used for site: queries).
        target_titles: List of job titles to search for (e.g. ["VP of Sales", "CTO"]).

    Returns:
        Dict with keys:
        - status: "found" | "not_found" | "error"
        - contact: {"name": str, "first_name": str, "last_name": str, "title": str} | None
        - reason: str
    """
    if not company_name or not target_titles:
        return {"status": "not_found", "contact": None, "reason": "Missing company_name or target_titles."}

    api_key = await _get_serper_api_key(tenant_id)
    if not api_key:
        reason = f"No Serper API key configured for tenant '{tenant_id}'. Cannot search for contacts."
        logger.warning(f"[CONTACT SEARCH] {reason}")
        return {"status": "error", "contact": None, "reason": reason}

    # Collect search snippets from queries across target titles
    collected_snippets: List[Dict[str, str]] = []  # {"title_query", "snippet", "source_url"}

    titles_to_search = target_titles[:3]  # Cap at 3 titles
    for title in titles_to_search:
        title = title.strip()
        if not title:
            continue

        # Try up to 2 query templates per title
        templates = PERSON_QUERY_TEMPLATES[:2]
        for template in templates:
            query = template.format(
                company_name=company_name,
                title=title,
                domain=domain,
            )

            try:
                result = await _execute_serper_search(api_key, query, num_results=5)
                organic = result.get("organic", [])

                for item in organic:
                    snippet = item.get("snippet", "").strip()
                    item_title = item.get("title", "").strip()
                    link = item.get("link", "")

                    if not snippet and not item_title:
                        continue

                    collected_snippets.append({
                        "title_query": title,
                        "snippet": f"{item_title}. {snippet}",
                        "source_url": link,
                    })

            except httpx.HTTPStatusError as e:
                logger.warning(f"[CONTACT SEARCH] Serper HTTP {e.response.status_code} for query '{query}'")
                if e.response.status_code == 401:
                    return {"status": "error", "contact": None, "reason": "Serper API key invalid (HTTP 401)."}
                elif e.response.status_code == 429:
                    logger.warning("[CONTACT SEARCH] Rate limited. Stopping further queries.")
                    break
                continue
            except Exception as e:
                logger.warning(f"[CONTACT SEARCH] Search error for query '{query}': {e}")
                continue

        if len(collected_snippets) >= 10:
            break  # Enough material to work with

    if not collected_snippets:
        logger.info(f"[CONTACT SEARCH] No search snippets found for '{company_name}' with titles {titles_to_search}")
        return {"status": "not_found", "contact": None, "reason": f"No search results found for decision-makers at {company_name}."}

    # Use LLM to extract person name + title from collected snippets
    contact = await _parse_person_from_snippets(company_name, domain, collected_snippets, titles_to_search)

    if contact:
        logger.info(f"[CONTACT SEARCH] ✅ Found contact for {company_name}: {contact['name']} ({contact['title']})")
        return {"status": "found", "contact": contact, "reason": ""}
    else:
        logger.info(f"[CONTACT SEARCH] No named person could be extracted from {len(collected_snippets)} snippets for '{company_name}'")
        return {"status": "not_found", "contact": None, "reason": f"Search returned snippets but no clear person name/title could be extracted for {company_name}."}


async def _parse_person_from_snippets(
    company_name: str,
    domain: str,
    snippets: List[Dict[str, str]],
    target_titles: List[str],
) -> Optional[Dict[str, str]]:
    """
    Uses an LLM micro-call to parse unstructured search snippets into a structured
    person record (name, first_name, last_name, title).

    Returns None if no clear person can be identified — never fabricates.
    """
    try:
        from services.llm_gateway import get_llm
        from langchain_core.messages import SystemMessage, HumanMessage
        import json

        llm = get_llm()

        # Build snippet context (cap at 5 snippets to keep prompt small)
        snippet_text = ""
        for i, s in enumerate(snippets[:5]):
            snippet_text += f"\n--- Snippet {i+1} (searching for: {s['title_query']}) ---\n{s['snippet']}\n"

        prompt = f"""You are extracting contact information from search results about {company_name} ({domain}).

TARGET ROLES WE ARE LOOKING FOR: {', '.join(target_titles)}

SEARCH SNIPPETS:
{snippet_text}

INSTRUCTIONS:
1. Identify a REAL person who works at {company_name} in one of the target roles listed above.
2. The person must be clearly named in the snippets — do NOT guess or make up a name.
3. If multiple people are found, pick the one whose title best matches the target roles.
4. If NO real person can be identified with confidence, return {{"found": false}}.

Return ONLY a valid JSON object:
- If found: {{"found": true, "name": "Full Name", "first_name": "First", "last_name": "Last", "title": "Their Actual Title"}}
- If not found: {{"found": false}}
"""

        response = await llm.ainvoke([
            SystemMessage(content="You extract real person names from search snippets. Return ONLY valid JSON. Never fabricate names."),
            HumanMessage(content=prompt),
        ])

        content = response.content.strip()

        # Clean markdown wrappers if present
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]

        parsed = json.loads(content.strip())

        if not parsed.get("found", False):
            return None

        name = parsed.get("name", "").strip()
        first_name = parsed.get("first_name", "").strip()
        last_name = parsed.get("last_name", "").strip()
        title = parsed.get("title", "").strip()

        if not name or not first_name:
            logger.warning(f"[CONTACT SEARCH] LLM returned found=true but missing first name/name: {parsed}")
            return None

        return {
            "name": name,
            "first_name": first_name,
            "last_name": last_name,
            "title": title or target_titles[0] if target_titles else "Executive",
        }

    except Exception as e:
        logger.error(f"[CONTACT SEARCH] LLM person parsing failed for {company_name}: {e}")
        return None
