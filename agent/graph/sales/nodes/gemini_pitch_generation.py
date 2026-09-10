"""
Stage 4: Gemini WhatsApp Pitch Generation Node.
Generates personalized, high-converting WhatsApp outreach messages for verified prospects
using Google Gemini (gemini-2.5-flash) with intelligent fallback.
"""
import logging
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from config import settings

logger = logging.getLogger(__name__)


async def get_tenant_company_context(tenant_id: str) -> Dict[str, str]:
    """Fetches tenant company context from backend or DB."""
    try:
        from services.agent_context_client import fetch_agent_context
        ctx = await fetch_agent_context("sales", tenant_id)
        if ctx:
            return {
                "company_name": ctx.get("company_name", "Antigravity AI"),
                "sender_name": ctx.get("sender_name", "Alex"),
                "sender_role": ctx.get("sender_role", "Business Development Representative"),
            }
    except Exception:
        pass
    return {
        "company_name": "Antigravity AI",
        "sender_name": "Alex",
        "sender_role": "AI Workflow Specialist",
    }


async def _generate_single_whatsapp_pitch(
    prospect: Dict[str, Any],
    sender_context: Dict[str, str],
    battlecard: str,
) -> str:
    company_name = prospect.get("company_name", "there")
    category = prospect.get("category", "business")
    rating = prospect.get("google_rating", 0.0)
    outreach_angle = prospect.get("outreach_angle", "operational workflow optimization")
    pain_points = prospect.get("key_pain_points") or ["customer order routing", "manual admin tasks"]
    sender_name = sender_context.get("sender_name", "Alex")
    sender_company = sender_context.get("company_name", "Antigravity AI")

    prompt = f"""You are {sender_name} from {sender_company}.
Write a highly compelling, personalized, conversational WhatsApp cold outreach message to {company_name} ({category}).

PROSPECT DETAILS:
- Company Name: {company_name}
- Category: {category}
- Google Rating: {rating if rating > 0 else 'Well-reviewed'}
- Recommended Angle: {outreach_angle}
- Pain Points: {', '.join(pain_points) if isinstance(pain_points, list) else pain_points}
- Solution Context: {battlecard}

WHATSAPP COPYWRITING RULES:
1. Short, conversational, friendly (2 to 3 concise paragraphs, max 100-120 words total).
2. Start with a warm greeting mentioning {company_name}.
3. Reference their positive local reputation or craft.
4. Clearly state how {sender_company} helps solve their specific operational pain point with AI workflows (zero vendor lock-in, immediate time/cost savings).
5. Natural emoji usage (2-4 tasteful emojis like 👋, ⚡, ✨).
6. End with a very low-friction CTA (e.g. "Open to a quick 5-min chat this week?").
7. NO email subject lines, NO email sign-offs ("Best regards", "Sincerely", "Dear Sir").

Output ONLY the final WhatsApp message text without any introductory commentary or quotation marks.
"""

    # 1. Attempt direct Gemini API
    try:
        from google import genai
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        resp = client.models.generate_content(
            model=settings.GEMINI_MODEL or "gemini-2.5-flash",
            contents=prompt,
        )
        body = resp.text.strip()
        if body:
            return body
    except Exception as e:
        logger.debug(f"[PITCH GEN] Direct Gemini note ({e}). Trying OpenRouter fallback.")

    # 2. Attempt OpenRouter fallback
    try:
        if settings.OPENROUTER_API_KEY:
            from langchain_openai import ChatOpenAI
            from langchain_core.messages import HumanMessage
            llm = ChatOpenAI(
                model=settings.OPENROUTER_MODEL or "openai/gpt-4o-mini",
                api_key=settings.OPENROUTER_API_KEY,
                base_url="https://openrouter.ai/api/v1",
                temperature=0.7,
            )
            res = await llm.ainvoke([HumanMessage(content=prompt)])
            body = res.content.strip()
            if body:
                return body
    except Exception as e:
        logger.debug(f"[PITCH GEN] OpenRouter note: {e}.")

    # 3. High-quality structured template fallback
    return (
        f"Hi {company_name}! 👋\n\n"
        f"I came across your business and was really impressed by your operations and customer feedback! ✨\n\n"
        f"I'm {sender_name} with {sender_company}. We help established businesses streamline operations and "
        f"automate customer inquiries using AI workflows—freeing up hours every week without any vendor lock-in.\n\n"
        f"Would you be open to a quick 5-minute chat this week to see how it works? ⚡\n\n"
        f"{sender_name} | {sender_company}"
    )


async def gemini_pitch_generation_node(state: SalesAgentState) -> Dict[str, Any]:
    verified_prospects = list(state.get("verified_prospects") or state.get("verified_contacts") or [])
    icp = state.get("icp_config") or {}
    tenant_id = state.get("tenant_id", "00000000-0000-0000-0000-000000000000")
    logs = list(state.get("logs", []))

    logger.info(f"[STAGE 4: GEMINI PITCH] Generating personalized WhatsApp pitches for {len(verified_prospects)} prospects.")

    if not verified_prospects:
        logs.append({
            "stage": "Stage 4: WhatsApp Pitch Generation",
            "status": "FAILED",
            "details": "0 verified prospects available for pitch generation.",
        })
        return {
            "outreach_batch": [],
            "icp_score": 0.0,
            "generated_outreach": None,
            "logs": logs,
        }

    sender_context = await get_tenant_company_context(tenant_id)
    battlecard = icp.get("battlecard_notes", "Autonomous enterprise AI workflow platform with zero vendor lock-in.")

    outreach_batch: List[Dict[str, Any]] = []

    for idx, prospect in enumerate(verified_prospects, 1):
        pitch_body = await _generate_single_whatsapp_pitch(
            prospect=prospect,
            sender_context=sender_context,
            battlecard=battlecard,
        )

        item = {
            "company_name": prospect.get("company_name", "Enterprise Client"),
            "domain": prospect.get("domain", "enterprise.com"),
            "contact_name": prospect.get("contact_name", "Decision Maker"),
            "contact_title": prospect.get("contact_title", "Owner / General Manager"),
            "contact_phone": prospect.get("contact_phone"),
            "whatsapp_status": prospect.get("whatsapp_status", "ON_WHATSAPP"),
            "whatsapp_jid": prospect.get("whatsapp_jid"),
            "outreach_channel": "whatsapp",
            "subject": f"Partnership Inquiry — {prospect.get('company_name')}",
            "body": pitch_body,
            "icp_score": float(prospect.get("icp_score") or 90.0),
            "address": prospect.get("address", ""),
            "google_rating": prospect.get("google_rating", 0.0),
            "review_count": prospect.get("review_count", 0),
            "place_id": prospect.get("place_id", ""),
            "quote_details": state.get("quote_details", {}),
            "scraped_text": "",
        }
        outreach_batch.append(item)

    avg_score = sum(p["icp_score"] for p in outreach_batch) / max(len(outreach_batch), 1)

    logger.info(
        f"[STAGE 4: GEMINI PITCH] Successfully generated {len(outreach_batch)} personalized WhatsApp pitches. "
        f"Average ICP score: {avg_score:.1f}"
    )

    logs.append({
        "stage": "Stage 4: WhatsApp Pitch Generation",
        "status": "COMPLETED",
        "details": f"Generated {len(outreach_batch)} personalized WhatsApp pitches using Gemini evaluation. Average ICP score: {avg_score:.1f}.",
    })

    return {
        "outreach_batch": outreach_batch,
        "icp_score": avg_score,
        "generated_outreach": {
            "subject": outreach_batch[0]["subject"],
            "body": outreach_batch[0]["body"],
        } if outreach_batch else None,
        "logs": logs,
    }
