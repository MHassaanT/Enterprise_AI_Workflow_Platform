"""
Gemini Evaluation Service.
Uses Google Gemini (gemini-2.5-flash) to evaluate commercial businesses discovered via Places API.
Performs structured ICP qualification, negative filtering (rejecting vendors/SaaS),
fit scoring (0-100), pain-point extraction, and outreach angle formulation.
"""
import json
import logging
import re
from typing import Dict, Any, List, Optional
from config import settings

logger = logging.getLogger(__name__)


def _get_gemini_client():
    from google import genai
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured in settings.")
    return genai.Client(api_key=api_key)


async def evaluate_business_candidates_with_gemini(
    candidates: List[Dict[str, Any]],
    icp_config: Dict[str, Any],
    tenant_id: str = "00000000-0000-0000-0000-000000000000",
) -> List[Dict[str, Any]]:
    """
    Evaluates a batch of business candidates from Google Places against the ICP criteria using Gemini.
    Returns the enriched candidate list with qualification, icp_score, pain_points, and outreach_angle.
    """
    if not candidates:
        return []

    target_industries = icp_config.get("target_industries", ["Commercial Business"])
    if isinstance(target_industries, str):
        target_industries = [target_industries]

    target_titles = icp_config.get("target_titles", ["Owner", "CEO", "General Manager"])
    region = icp_config.get("region", "")
    battlecard_notes = icp_config.get("battlecard_notes", "Enterprise AI Workflow Platform with zero vendor lock-in.")

    client = _get_gemini_client()

    # Prepare candidate summaries for Gemini
    formatted_candidates = []
    for idx, c in enumerate(candidates, 1):
        formatted_candidates.append({
            "candidate_index": idx,
            "company_name": c.get("company_name", ""),
            "domain": c.get("domain", ""),
            "category": c.get("category", ""),
            "address": c.get("address", ""),
            "google_rating": c.get("google_rating", 0.0),
            "review_count": c.get("review_count", 0),
            "phone": c.get("contact_phone") or c.get("raw_phone", "None"),
            "website": c.get("website_uri", ""),
        })

    prompt = f"""You are an elite B2B Sales SDR Evaluation AI.
Your job is to strictly evaluate commercial businesses found via Google Places API against the user's Ideal Customer Profile (ICP).

TARGET ICP SPECIFICATION:
- Target Industries: {', '.join(target_industries)}
- Target Region: {region or 'Any'}
- Target Decision Maker Titles: {', '.join(target_titles) if isinstance(target_titles, list) else target_titles}
- Value Proposition / Solution Context: {battlecard_notes}

CRITICAL QUALIFICATION RULES:
1. OPERATIONAL REALITY: The company MUST BE an actual business operating WITHIN the target industry (e.g. producing, baking, preparing food, serving customers if the industry is Food/Bakery).
2. HARD REJECTION OF VENDORS: Immediately REJECT (qualified = false) any vendor, software company, POS system, SaaS platform, insurance provider, training portal, directory, or consulting agency that sells products/services TO the target industry.
3. QUALITY FILTER: Businesses with good customer ratings and active operations should score higher.
4. TARGET ROLE: Infer the primary decision maker role (e.g., "Owner / General Manager", "Founder / Managing Partner", "Operations Director").

CANDIDATES TO EVALUATE:
{json.dumps(formatted_candidates, indent=2)}

OUTPUT FORMAT REQUIREMENTS:
Return a JSON array of evaluation objects matching the input candidates in order.
Do not include any Markdown text or backticks before or after the JSON array.
Each object must have this exact structure:
[
  {{
    "candidate_index": 1,
    "qualified": true,
    "rejection_reason": null,
    "icp_score": 92.5,
    "target_role": "Owner / General Manager",
    "key_pain_points": ["Labor scheduling and food waste reduction", "High third-party delivery commission fees"],
    "outreach_angle": "Highlight autonomous order routing and operational cost savings."
  }}
]
"""

    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL or "gemini-2.5-flash",
            contents=prompt,
        )

        response_text = response.text.strip()
        # Clean potential markdown fences
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        elif response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        evaluations = json.loads(response_text)
        eval_map = {e.get("candidate_index"): e for e in evaluations if isinstance(e, dict)}

        enriched_candidates = []
        for idx, c in enumerate(candidates, 1):
            eval_data = eval_map.get(idx, {})
            is_qualified = bool(eval_data.get("qualified", True))
            score = float(eval_data.get("icp_score") or (85.0 if is_qualified else 30.0))
            rejection = eval_data.get("rejection_reason")
            target_role = eval_data.get("target_role") or "Owner / Decision Maker"
            pain_points = eval_data.get("key_pain_points") or ["Operational efficiency", "Workflow automation"]
            outreach_angle = eval_data.get("outreach_angle") or "Streamlining business operations and customer workflows."

            enriched = dict(c)
            enriched["qualified"] = is_qualified
            enriched["rejection_reason"] = rejection
            enriched["icp_score"] = score
            enriched["target_role"] = target_role
            enriched["key_pain_points"] = pain_points
            enriched["outreach_angle"] = outreach_angle
            enriched_candidates.append(enriched)

        logger.info(
            f"[GEMINI EVALUATOR] Evaluated {len(candidates)} businesses: "
            f"{sum(1 for e in enriched_candidates if e['qualified'])} qualified, "
            f"{sum(1 for e in enriched_candidates if not e['qualified'])} rejected."
        )
        return enriched_candidates

    except Exception as e:
        logger.warning(f"[GEMINI EVALUATOR] Direct Gemini API note ({e}). Attempting OpenRouter LLM fallback.")
        try:
            if settings.OPENROUTER_API_KEY:
                from langchain_openai import ChatOpenAI
                from langchain_core.messages import SystemMessage, HumanMessage
                llm = ChatOpenAI(
                    model=settings.OPENROUTER_MODEL or "openai/gpt-4o-mini",
                    api_key=settings.OPENROUTER_API_KEY,
                    base_url="https://openrouter.ai/api/v1",
                    temperature=0.1,
                )
                llm_res = await llm.ainvoke([
                    SystemMessage(content="You are an elite B2B Sales SDR Evaluation AI. Respond ONLY with a valid JSON array."),
                    HumanMessage(content=prompt)
                ])
                res_content = llm_res.content.strip()
                if res_content.startswith("```json"):
                    res_content = res_content[7:]
                elif res_content.startswith("```"):
                    res_content = res_content[3:]
                if res_content.endswith("```"):
                    res_content = res_content[:-3]
                res_content = res_content.strip()
                evaluations = json.loads(res_content)
                eval_map = {e.get("candidate_index"): e for e in evaluations if isinstance(e, dict)}

                enriched_candidates = []
                for idx, c in enumerate(candidates, 1):
                    eval_data = eval_map.get(idx, {})
                    is_qualified = bool(eval_data.get("qualified", True))
                    score = float(eval_data.get("icp_score") or (85.0 if is_qualified else 30.0))
                    rejection = eval_data.get("rejection_reason")
                    target_role = eval_data.get("target_role") or "Owner / Decision Maker"
                    pain_points = eval_data.get("key_pain_points") or ["Operational efficiency", "Workflow automation"]
                    outreach_angle = eval_data.get("outreach_angle") or "Streamlining business operations and customer workflows."

                    enriched = dict(c)
                    enriched["qualified"] = is_qualified
                    enriched["rejection_reason"] = rejection
                    enriched["icp_score"] = score
                    enriched["target_role"] = target_role
                    enriched["key_pain_points"] = pain_points
                    enriched["outreach_angle"] = outreach_angle
                    enriched_candidates.append(enriched)

                logger.info(f"[GEMINI EVALUATOR] Evaluated {len(candidates)} businesses via OpenRouter fallback.")
                return enriched_candidates
        except Exception as fallback_err:
            logger.warning(f"[GEMINI EVALUATOR] OpenRouter fallback note: {fallback_err}. Applying safe heuristic fallback.")

        # Safe heuristic fallback
        enriched_candidates = []
        for c in candidates:
            enriched = dict(c)
            cat = (c.get("category") or "").lower()
            name = (c.get("company_name") or "").lower()
            # Reject if obvious vendor / tech
            is_vendor = any(w in cat or w in name for w in ["software", "pos", "tech", "platform", "app", "system", "consult"])
            rating = c.get("google_rating", 0.0)
            enriched["qualified"] = not is_vendor
            enriched["rejection_reason"] = "Tech vendor selling to target industry" if is_vendor else None
            enriched["icp_score"] = min(95.0, 70.0 + (rating * 5.0)) if not is_vendor else 20.0
            enriched["target_role"] = "Owner / General Manager"
            enriched["key_pain_points"] = ["Operational workflow management", "Customer communication efficiency"]
            enriched["outreach_angle"] = "Modernizing operations with automated AI workflows."
            enriched_candidates.append(enriched)
        return enriched_candidates
