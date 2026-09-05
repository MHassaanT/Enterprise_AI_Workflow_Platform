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

1. GENERAL INQUIRIES (NO AUTHENTICATION NEEDED):
   - For general inquiries (company policies, platform status, pricing, how the service works, general questions):
     Answer directly using document excerpts. Do NOT ask for email or OTP for general, non-personal questions.

2. USER-SPECIFIC RECORDS & TRIPS (MANDATORY EMAIL OTP AUTHENTICATION):
   - Personal records—such as rides, passenger/rider names, trip locations, cancellation reasons, orders, and account details—are private to each user.
   - Simply typing an email address (e.g. "My email is user@example.com") or Ride ID DOES NOT prove identity! Anyone could enter someone else's email to steal their trip or personal details.
   - Therefore, whenever a customer asks about their specific ride, booking, cancellation reason, order, or account:
     Step 1: Ask for their registered email address:
             "I'm sorry to hear that your ride was cancelled. To protect your privacy and look up your trip details securely, could you please provide your registered email address?"
     Step 2: When the customer provides their email address, you MUST IMMEDIATELY call `authenticate_user_with_email(email=..., action='send_otp')`.
             DO NOT search the database or disclose ANY ride details yet!
     Step 3: Ask the customer for the OTP:
             "I have sent a 6-digit verification code to [email]. Please enter the code here to verify your identity so I can pull up your ride details."
     Step 4: When the customer enters the 6-digit code, call `authenticate_user_with_email(email=..., action='verify_otp', otp_code=...)`.
     Step 5: ONLY AFTER the tool returns 'Verification SUCCESSFUL':
             Search the database for their ride using their verified email address or Ride ID.
             If multiple rides exist for this verified user, ask them which specific trip they are referring to.
             Provide the ride details to the verified user.

3. NEVER GUESS OR ARBITRARILY PICK RECORDS:
   - If a search returns multiple records (e.g. 3 cancelled rides):
     NEVER arbitrarily pick the first record!
     Ask the verified user to clarify which ride is theirs (e.g. by date/time or pickup location).

4. TOOL USAGE:
   - Use tools when you need live data.
   - NEVER query or reveal personal customer records based on an unverified email address without completing the OTP verification process first.

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
