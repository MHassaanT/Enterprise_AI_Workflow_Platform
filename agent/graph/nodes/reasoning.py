"""
Reasoning Node — the LLM brain of the agent.

Receives: conversation history + retrieved context + tool results
Produces: either a final answer (next_step="respond") or a tool call (next_step="tool_call")

Uses the LLM gateway abstraction — Gemini or Ollama, env-switched.
"""
from langchain_core.messages import SystemMessage, AIMessage, ToolMessage
from graph.state import AgentState
from services.llm_gateway import get_llm
from tool_gateway.registry import get_tools_for_agent, get_allowed_tool_bindings

# Actions that default to high risk requiring human approval before execution
HIGH_RISK_TOOLS = {"escalate_to_human", "issue_refund", "process_payment"}


def _build_system_prompt(context: list[dict]) -> str:
    prompt = """You are a helpful Customer Support AI agent for an enterprise platform.

CRITICAL RULES (in priority order):

1. TOOL-FIRST RULE: When a user asks about order status, order tracking, order details,
   customer lookups, shipment tracking, or ANY data that can be retrieved via an available
   tool — you MUST call that tool IMMEDIATELY. Do NOT answer from document excerpts for
   these queries. Do NOT say you cannot help. Call the tool.

2. DOCUMENT RULE: For product information, company policies, pricing, and general questions
   that are NOT about specific customer data, use the provided document excerpts to answer.

3. ESCALATION RULE: For high-risk or irreversible actions (refunds, payments, account
   changes), call the escalate_to_human tool. If you truly cannot answer from tools or
   documents, also escalate — NEVER refuse to help.

4. NEVER say "I cannot assist with that" or "I don't have access to" — you always have
   tools available. Use them.

Response format:
- Keep answers concise, direct, and focused (1-2 sentences).
- Do NOT include citation markers like [1], [2], or source labels.
- Do NOT invent information not present in documents or tool results.
"""
    if context:
        excerpts = "\n\n".join(
            f"[{i+1}] (Source: {c.get('documentName','Unknown')} | "
            f"Section: {c.get('section','')}) \n{c.get('text','')}"
            for i, c in enumerate(context)
        )
        prompt += f"\n\nDOCUMENT EXCERPTS:\n{excerpts}"
    return prompt


async def reasoning_node(state: AgentState) -> dict:
    llm = get_llm()
    agent_id = state["agent_instance_id"]
    tools = await get_tools_for_agent(agent_id)
    bindings = await get_allowed_tool_bindings(agent_id)

    # Diagnostic logging — critical for debugging tool binding issues
    tool_names = [t.name for t in tools] if tools else []
    print(f"[REASONING] Agent={agent_id} | Tools bound: {tool_names} | Bindings count: {len(bindings)} | Context chunks: {len(state.get('context', []))}")
    
    # Map tool names to whether they require human approval based on ToolBinding DB config
    high_risk_map = {
        b["tool_name"]: b.get("is_high_risk", False) for b in bindings
    }

    # Keywords that indicate the user wants live data from a tool, not document excerpts
    TOOL_INTENT_KEYWORDS = {
        "order status", "track order", "order details", "my order",
        "order id", "ord-", "shipping status", "delivery status",
        "check order", "where is my order", "track my", "tracking number",
        "order number", "order update", "check my order", "look up order",
        "lookup order", "find my order", "order info",
    }

    context = state.get("context", [])
    question_lower = (state.get("question") or "").strip().lower()
    is_tool_intent = any(kw in question_lower for kw in TOOL_INTENT_KEYWORDS)

    if is_tool_intent and has_tool_context:
        # Tool-intent detected: force the LLM to call a tool and strip RAG context
        # so the LLM doesn't get confused by irrelevant document excerpts
        llm_with_tools = llm.bind_tools(tools, tool_choice="any")
        context = []  # Clear RAG context to prevent document-based answers
        print(f"[REASONING] TOOL-INTENT detected for '{question_lower}' — forcing tool_choice='any', clearing RAG context")
    elif has_tool_context:
        llm_with_tools = llm.bind_tools(tools)
    else:
        llm_with_tools = llm

    system_msg = SystemMessage(content=_build_system_prompt(context))
    history = list(state["messages"])

    response: AIMessage = await llm_with_tools.ainvoke([system_msg] + history)

    # ── Tool call requested ──
    if hasattr(response, "tool_calls") and response.tool_calls:
        call = response.tool_calls[0]
        tool_name = call["name"]

        is_high_risk = tool_name in HIGH_RISK_TOOLS or high_risk_map.get(tool_name, False)

        return {
            "messages": [response],
            "next_step": "tool_call",
            "pending_tool_call": {
                "name": tool_name,
                "arguments": call["args"],
                "id": call.get("id", tool_name),  # OpenAI requires exact tool_call_id match
            },
            "is_high_risk": is_high_risk,
        }

    # ── Final answer ──
    return {
        "messages": [response],
        "next_step": "respond",
        "tool_result": None,
    }
