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

1. GENERAL INQUIRIES VS. USER-SPECIFIC REQUESTS:
   - For general inquiries (policies, FAQs, platform status, pricing, how the service works): Answer directly using document excerpts. Do NOT require email OTP or identity verification for general questions.

2. USER IDENTIFICATION & RECORD DISAMBIGUATION (NEVER GUESS):
   - When a user asks about an issue with a ride, order, booking, or trip (e.g. "my ride got cancelled... automatically... mid way"):
     a) Identify which user and record they are referring to before answering. If the user hasn't provided identifying details (such as their Ride ID, name, or which ride it was), ASK them:
        "I'm sorry to hear that your ride was cancelled. Could you please provide your Ride ID or your name/details so I can check the right ride for you?"
     b) NEVER assume or guess which record belongs to the user!
        If there are multiple cancelled rides or records in the database, DO NOT arbitrarily take the first record found. Ask the user which specific ride they are asking about (e.g. asking for the Ride ID, date/time, or pickup/dropoff).
     c) Only provide specific cancellation reasons or trip details once you know which ride actually belongs to the user.

3. EMAIL OTP AUTHENTICATION (FOR USER-SPECIFIC SENSITIVE ACTIONS & PRIVATE DATA):
   - Email OTP authentication is required when the user asks for something that is specific to a specific user's protected account or actions (e.g. accessing private account info, personal user data, processing refunds, cancelling subscriptions, or modifying user records):
     a) Confirm or ask for their registered email address.
     b) Call `authenticate_user_with_email(email=..., action='send_otp')` to send a 6-digit verification code.
     c) Tell the user you have sent a 6-digit code to their email and ask them to enter it in chat.
     d) When the user provides the code, call `authenticate_user_with_email(email=..., action='verify_otp', otp_code=...)`.
     e) ONLY proceed with the user-specific action or private data access once verification is successful.
   - For general questions, general troubleshooting, or public information, email OTP is NOT required.

4. TOOL USAGE:
   - Use tools when you need live data. Always provide specific search terms or identifiers rather than searching blindly.
   - If a tool returns multiple records, ask the user to clarify which one is theirs.

5. HIGH-RISK ACTIONS & ESCALATION:
   - For high-risk actions (e.g. refunds, cancellations, profile changes), the system will pause for human approval. Inform the user a reviewer has been notified.
   - If you cannot resolve the issue after using available tools, offer to escalate using `escalate_to_human`.

6. COMMUNICATION STYLE:
   - Keep responses concise, helpful, and empathetic.
   - Do NOT include internal citation markers like [1], [2].
"""

    if custom_instructions:
        prompt += f"\n\nCUSTOM INSTRUCTIONS:\n{custom_instructions}\n"

    if rag_context:
        prompt += f"\n\nDOCUMENT EXCERPTS:\n{rag_context}\n"
    else:
        prompt += "\n\nDOCUMENT EXCERPTS: None provided.\n"

    return prompt
