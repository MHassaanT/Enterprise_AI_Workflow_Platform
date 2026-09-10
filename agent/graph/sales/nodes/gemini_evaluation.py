"""
Stage 2: Gemini Evaluation Node.
Evaluates businesses sourced via Places Discovery using Google Gemini (gemini-2.5-flash).
Filters out tech vendors, validates ICP fit, extracts pain points, and computes fit scores.
Replaces Crawl4AI web scraping completely.
"""
import logging
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from services.gemini_evaluator import evaluate_business_candidates_with_gemini

logger = logging.getLogger(__name__)


async def gemini_evaluation_node(state: SalesAgentState) -> Dict[str, Any]:
    raw_places = state.get("raw_places") or state.get("raw_accounts") or []
    icp_config = state.get("icp_config") or {}
    prospect_limit = state.get("prospect_limit") or 10
    tenant_id = state.get("tenant_id", "00000000-0000-0000-0000-000000000000")
    logs = list(state.get("logs", []))

    logger.info(f"[STAGE 2: GEMINI EVALUATION] Evaluating {len(raw_places)} candidate businesses with Gemini.")

    if not raw_places:
        log_entry = {
            "stage": "Stage 2: Gemini Evaluation",
            "status": "FAILED",
            "details": "No places discovered in Stage 1 to evaluate.",
        }
        logs.append(log_entry)
        return {
            "qualified_places": [],
            "account_fit_passed": False,
            "logs": logs,
            "scraped_accounts": [],
        }

    # Evaluate candidates with Gemini
    eval_limit = max(prospect_limit * 6, 30)
    candidates_to_eval = raw_places[:eval_limit]
    evaluated_candidates = await evaluate_business_candidates_with_gemini(
        candidates=candidates_to_eval,
        icp_config=icp_config,
        tenant_id=tenant_id,
    )

    qualified_places: List[Dict[str, Any]] = [
        c for c in evaluated_candidates if c.get("qualified", False)
    ]
    rejected_count = len(evaluated_candidates) - len(qualified_places)

    logger.info(
        f"[STAGE 2: GEMINI EVALUATION] Evaluation complete: {len(qualified_places)} qualified, "
        f"{rejected_count} rejected as off-ICP/vendors."
    )

    if qualified_places:
        status_str = "COMPLETED"
        details = (
            f"Gemini evaluated {len(evaluated_candidates)} business profiles: "
            f"{len(qualified_places)} qualified as on-ICP commercial entities. "
            f"Filtered out {rejected_count} unqualified vendors/directories."
        )
        passed = True
    else:
        status_str = "NO_LEADS_FOUND"
        details = (
            f"Gemini evaluated {len(evaluated_candidates)} entities but none met strict ICP criteria. "
            f"All {rejected_count} entities rejected."
        )
        passed = False

    logs.append({
        "stage": "Stage 2: Gemini Evaluation",
        "status": status_str,
        "details": details,
    })

    return {
        "qualified_places": qualified_places,
        "account_fit_passed": passed,
        "logs": logs,
        # Legacy compatibility aliases
        "scraped_accounts": qualified_places,
    }
