"""Agent Context Client — fetches tenant entity schema and agent configuration."""
import httpx
from typing import Dict, Any, List
from config import settings

_HEADERS = lambda: {"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN}


async def get_tenant_agent_context(tenant_id: str) -> Dict[str, Any]:
    """Fetch the full agent context (entities, company, config) for a tenant."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.BACKEND_URL}/internal/tenants/{tenant_id}/agent-context",
                headers=_HEADERS(),
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        print(f"[AGENT CONTEXT ERROR] Failed to fetch context for tenant {tenant_id}: {e}")
        return {
            "agent_context": {
                "company_name": "Enterprise Client",
                "company_description": "",
                "support_tone": "professional",
                "auto_escalate_keywords": [],
                "auto_escalate_after_attempts": 3,
                "max_tool_calls_per_turn": 5,
                "enable_proactive_suggestions": True,
                "custom_system_instructions": "",
            },
            "entities": [],
            "company": {},
        }


def build_entity_tools_description(entities: List[Dict[str, Any]]) -> str:
    """Generate a human-readable entity catalog for the system prompt."""
    if not entities:
        return "No custom entities configured for this tenant."

    lines = []
    for entity in entities:
        name = entity.get("entity_name", "unknown")
        display = entity.get("display_name", name)
        desc = entity.get("description", "")
        ops = entity.get("operations", [])
        fields = entity.get("fields", [])

        op_names = [o.get("operation_name", "") for o in ops if o.get("is_enabled", True)]
        field_descs = [
            f"{f.get('field_name')} ({f.get('field_type')})"
            for f in fields
            if f.get("is_searchable", True)
        ]

        lines.append(
            f"- {display} (entity: '{name}'): {desc}\n"
            f"  Operations: {', '.join(op_names) or 'search, get_by_id'}\n"
            f"  Fields: {', '.join(field_descs) or 'id'}"
        )

    return "\n".join(lines)


def build_dynamic_system_prompt(
    agent_context: Dict[str, Any],
    entities: List[Dict[str, Any]],
    company: Dict[str, Any],
    tool_descriptions: str,
    rag_context: str = "",
    user_id: str = "anonymous",
) -> str:
    """
    Build a dynamic system prompt from tenant configuration.
    Replaces the old hardcoded _build_system_prompt().
    """
    company_name = agent_context.get("company_name", company.get("name", "Enterprise Client"))
    tone = agent_context.get("support_tone", "professional")
    custom_instructions = agent_context.get("custom_system_instructions", "")
    entity_desc = build_entity_tools_description(entities)

    tone_map = {
        "professional": "Maintain a professional, courteous tone. Be concise and direct.",
        "friendly": "Be warm, approachable, and conversational. Use natural language.",
        "technical": "Be precise and technical. Assume the user has some technical knowledge.",
        "casual": "Be relaxed and informal. Use everyday language.",
    }
    tone_instruction = tone_map.get(tone, "Maintain a professional, courteous tone.")

    prompt = f"""You are the AI Customer Support Agent for {company_name}.
{tone_instruction}

YOUR CAPABILITIES:
You have access to tools that can query live data about users, their records, and platform status. You also have access to document excerpts containing policies and FAQs.

AVAILABLE TOOLS:
{tool_descriptions}

PLATFORM ENTITIES (Business Objects):
{entity_desc}

SESSION CONTEXT:
Current Customer Identifier: {user_id if user_id and user_id != 'anonymous' else 'Anonymous / Unverified Customer'}

CRITICAL GUIDELINES:

1. CUSTOMER IDENTITY & RECORD VERIFICATION (MANDATORY):
   - When a user asks about an issue with a personal transaction, trip, booking, ride, order, or account (e.g. "my ride got cancelled", "where is my order", "I need a refund"):
     a) If the user has NOT provided their identifying details (such as their Ride ID / Booking Reference, Order Number, Phone Number, Name, or Email):
        DO NOT guess or search the whole database blindly without identifiers!
        Politely ASK the user for their identifying details first (e.g. "I'm sorry to hear that your ride was cancelled. Could you please provide your Ride ID or the phone number/email registered with your ride so I can look up the exact details for you?").
     b) If you have multiple records in the system matching a search (e.g. 3 cancelled rides):
        NEVER arbitrarily pick the first record or assume it belongs to the user!
        Ask the user to clarify which record is theirs (e.g. "I see multiple ride records on file. Could you please specify your Ride ID or the date/time and pickup location?").
     c) ONLY provide status, cancellation reasons, or actions for a record once you have confirmed it matches the user's specific Ride ID or verified identity.

2. TOOL USAGE:
   - Use tools when you need live data.
   - When calling search tools (e.g. search_rides, search_orders), ALWAYS include specific search terms or filters (such as ride ID, customer email, phone, or passenger name).
   - If a tool returns multiple records, treat it as ambiguous and ask the user to clarify or identify their specific record.

3. KNOWLEDGE & POLICIES:
   - Use document excerpts for policies, refund rules, pricing, and general platform FAQs.
   - NEVER invent or hallucinate facts outside the provided documents and tools. If an answer cannot be determined, state so clearly and offer to escalate.

4. HIGH-RISK ACTIONS & ESCALATION:
   - For high-risk actions (e.g. refunds, cancellations, profile changes), the system will pause for human approval. Inform the user a reviewer has been notified.
   - If you cannot resolve the issue after using available tools, offer to escalate using escalate_to_human.

5. USER IDENTITY VERIFICATION (EMAIL OTP): When a customer asks for sensitive information or actions (e.g., account details, orders, refunds, personal profile, or private data):
   a) Confirm their email address (from get_current_user or by asking).
   b) Call `authenticate_user_with_email(email=..., action='send_otp')` to generate and send a 6-digit verification code.
   c) Tell the user you have sent a 6-digit code to their email and ask them to enter it in this chat.
   d) When the customer enters the code, call `authenticate_user_with_email(email=..., action='verify_otp', otp_code=...)`.
   e) ONLY after the tool returns 'Verification SUCCESSFUL', proceed to answer their question or fulfill their request. If verification fails, inform the user and ask them to retry or request a new code.

6. COMMUNICATION STYLE:
   - Keep responses concise, helpful, and empathetic.
   - Do NOT include citation markers like [1], [2].
"""

    if custom_instructions:
        prompt += f"\n\nCUSTOM INSTRUCTIONS:\n{custom_instructions}\n"

    if rag_context:
        prompt += f"\n\nDOCUMENT EXCERPTS:\n{rag_context}\n"
    else:
        prompt += "\n\nDOCUMENT EXCERPTS: None provided.\n"

    return prompt
