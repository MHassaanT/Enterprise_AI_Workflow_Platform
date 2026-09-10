"""
Stage 1: Google Places Discovery Node.
Discovers commercial entities in target industries and region using Google Places API (New)
with automated fallback to Serper Places.
"""
import logging
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from tool_gateway.places_discovery import search_places_discovery

logger = logging.getLogger(__name__)


async def places_discovery_node(state: SalesAgentState) -> Dict[str, Any]:
    prospect_limit = state.get("prospect_limit") or 10
    tenant_id = state.get("tenant_id", "00000000-0000-0000-0000-000000000000")
    icp_config = state.get("icp_config") or {}
    logs = list(state.get("logs", []))

    target_industries = icp_config.get("target_industries") or ["Commercial Business"]
    if isinstance(target_industries, str):
        target_industries = [target_industries]

    region = icp_config.get("region", "")
    existing_domains = set(state.get("existing_domains") or [])
    existing_phones = set(state.get("existing_phones") or [])

    logger.info(
        f"[STAGE 1: PLACES DISCOVERY] Querying places for industries={target_industries}, "
        f"region='{region}', limit={prospect_limit}"
    )

    fetch_limit = max(prospect_limit * 5, 25)
    discovery_res = await search_places_discovery(
        target_industries=target_industries,
        region=region,
        limit=fetch_limit,
        tenant_id=tenant_id,
    )

    raw_places = discovery_res.get("places", [])
    api_used = discovery_res.get("api_used", "unknown")

    # Filter out already contacted/evaluated domains and phone numbers
    filtered_places: List[Dict[str, Any]] = []
    for p in raw_places:
        dom = (p.get("domain") or "").lower().strip()
        ph = (p.get("contact_phone") or "").strip()
        if dom and dom in existing_domains:
            continue
        if ph and ph in existing_phones:
            continue
        filtered_places.append(p)

    logger.info(
        f"[STAGE 1: PLACES DISCOVERY] Sourced {len(raw_places)} places via {api_used}, "
        f"{len(filtered_places)} passed deduplication."
    )

    if filtered_places:
        status_str = "COMPLETED"
        details = (
            f"Discovered {len(filtered_places)} operational commercial entities via {api_used} "
            f"for '{', '.join(target_industries)}' in '{region or 'Global'}'. "
            f"Found {sum(1 for p in filtered_places if p.get('contact_phone'))} direct phone numbers."
        )
    else:
        status_str = "NO_PLACES_FOUND"
        details = f"0 candidate commercial entities found for '{', '.join(target_industries)}' in '{region}'."

    logs.append({
        "stage": "Stage 1: Google Places Discovery",
        "status": status_str,
        "details": details,
    })

    return {
        "raw_places": filtered_places,
        "logs": logs,
        # Legacy compatibility aliases
        "raw_accounts": filtered_places,
    }
