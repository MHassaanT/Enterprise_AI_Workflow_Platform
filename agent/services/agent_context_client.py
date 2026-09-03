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

GUIDELINES:
1. ALWAYS identify the user first. Use get_current_user or get_user_by_email.
2. Use tools when you need live data. Tool descriptions tell you what each tool does.
3. Use document excerpts for policies, pricing, and general information.
4. Follow prerequisites in tool descriptions. If a tool says you MUST gather X first, do it.
5. For high-risk actions, the system will pause for human approval. Inform the user a reviewer has been notified.
6. If you cannot resolve the issue after using available tools, escalate to a human using escalate_to_human.
7. NEVER use outside general knowledge. If the answer isn't in documents or tools, say so clearly.
8. Keep responses concise and helpful. Do NOT include citation markers like [1], [2].
9. When searching for user records, prefer using the user's email or ID from get_current_user.
10. If a user mentions an entity type (e.g., "listing", "order", "appointment"), use the corresponding search tool.
"""

    if custom_instructions:
        prompt += f"\n\nCUSTOM INSTRUCTIONS:\n{custom_instructions}\n"

    if rag_context:
        prompt += f"\n\nDOCUMENT EXCERPTS:\n{rag_context}\n"
    else:
        prompt += "\n\nDOCUMENT EXCERPTS: None provided.\n"

    return prompt
