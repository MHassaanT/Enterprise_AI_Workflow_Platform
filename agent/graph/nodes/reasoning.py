"""
Reasoning Node — the LLM brain of the agent.

Receives: conversation history + retrieved context + tool results
Produces: either a final answer (next_step="respond") or a tool call (next_step="tool_call")

Uses the LLM gateway abstraction — Gemini or Ollama, env-switched.
"""
from langchain_core.messages import SystemMessage, AIMessage, ToolMessage, HumanMessage
from graph.state import AgentState
from services.llm_gateway import get_llm
from tool_gateway.registry import get_tools_for_agent, get_allowed_tool_bindings

# Actions that default to high risk requiring human approval before execution if not configured in UI
HIGH_RISK_TOOLS = {"issue_refund", "process_payment", "submit_refund_request"}


def _build_system_prompt(context: list[dict], has_recent_tool_call: bool = False) -> str:
    prompt = """You are a helpful Customer Support AI agent for an enterprise platform.

CRITICAL RULES (in priority order):
"""
    if not has_recent_tool_call:
        prompt += """
1. CONTEXT EVALUATION RULE:
   - First, evaluate the user's question against the provided DOCUMENT EXCERPTS and available tools.
   - If the question is in context (covered by the provided document excerpts or relates to available support tools/greetings), answer it using ONLY the provided document excerpts or tools.
   - If the question is NOT in context (not covered by the provided document excerpts and not a tool request or greeting), you MUST respond with: "The query is out of context."
   - Do NOT use outside general knowledge (such as recipes like how to make tea, general trivia, or unprovided topics) to answer questions.
"""
    else:
        prompt += """
1. POST-TOOL RULE:
   - You have just executed a tool. Summarize the tool result into a helpful, conversational response.
   - Never say the query is out of context when summarizing a tool result.
   - For refund flows, carefully follow the REFUND FLOW RULE.
"""

    prompt += """
2. TOOL-FIRST RULE: When a user asks about order status, order tracking, order details,
   customer lookups, shipment tracking, or ANY data that can be retrieved via an available
   tool — you MUST call that tool IMMEDIATELY. Do NOT answer from document excerpts for
   these queries. Call the tool.

3. DOCUMENT RULE: For product information, company policies, pricing, and general questions
   that are NOT about specific customer data, use ONLY the provided document excerpts to answer.
   If the answer is not in the document excerpts, state that the query is out of context.

4. ESCALATION RULE: For high-risk or irreversible actions (refunds, payments), call the escalate_to_human tool. DO NOT escalate when asked for order details — you MUST always call the data lookup tools (like Airtable or check_order_status) first!

5. SYSTEM RESUMPTION RULE (Critical for graph resumes):
   - When you receive a SYSTEM NOTIFICATION about an approved or rejected refund action, you MUST call the Gmail tool immediately.
   - Do NOT respond with text only. Call the tool first.
   - The tool will use action='gmail_send_email' to notify the customer of the decision.
   - Extract recipient email from the system notification message.
   - After Gmail executes, summarize the notification result to confirm the customer was contacted.

6. REFUND FLOW RULE: When the user asks for a refund, strictly follow this flow:
   a. Ask for order ID or email if not provided.
   b. Use `check_order_status` (or similar lookup tool) to fetch order details dynamically.
   c. Inspect the returned data to determine if the order is delivered or shipped.
   d. If not delivered, politely refuse the refund. If delivered, ask for the reason for the refund.
   e. Before submitting, you MUST explicitly ask the user to confirm their name, email, and refund reason.
   f. Upon confirmation, call the `submit_refund_request` tool with all collected data.
   g. If a previous action was a refund decision, use the `Gmail` tool (with action `gmail_send_email`) to notify the user.

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
    else:
        prompt += "\n\nDOCUMENT EXCERPTS: None provided."
    return prompt


MAX_TOOL_RETRIES = 3  # Circuit breaker: max consecutive tool call attempts


async def reasoning_node(state: AgentState) -> dict:
    llm = get_llm()
    agent_id = state["agent_instance_id"]
    tools = await get_tools_for_agent(agent_id)
    bindings = await get_allowed_tool_bindings(agent_id)

    # Circuit breaker: if the ReAct loop has retried tools too many times,
    # stop looping and give a clear error to the user
    retry_count = state.get("tool_retry_count", 0)
    if retry_count >= MAX_TOOL_RETRIES:
        print(f"[REASONING] Circuit breaker triggered: {retry_count} consecutive tool failures for agent={agent_id}")
        return {
            "messages": [AIMessage(content=(
                "I encountered a technical issue while trying to retrieve that information. "
                "Please try again in a moment, or contact support if the issue persists."
            ))],
            "next_step": "respond",
            "tool_result": None,
            "pending_tool_call": None,
        }

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
        "refund", "apply for refund", "request refund", "return order", "want a refund"
    }

    GREETINGS = {
        "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
        "thanks", "thank you", "bye", "goodbye"
    }

    context = state.get("context", [])
    has_tool_context = bool(tools)
    question_lower = (state.get("question") or "").strip().lower()
    is_tool_intent = any(kw in question_lower for kw in TOOL_INTENT_KEYWORDS)
    is_greeting = any(g in question_lower for g in GREETINGS)
    is_system = question_lower == "system notification"

    # Check if a tool has already been executed for the current user turn
    has_recent_tool_call = False
    for msg in reversed(state.get("messages", [])):
        if isinstance(msg, HumanMessage):
            break
        if isinstance(msg, ToolMessage):
            has_recent_tool_call = True
            break

    # If no document context was retrieved from RAG, and query is neither a tool intent nor a greeting nor post-tool turn:
    if not context and not is_tool_intent and not has_recent_tool_call and not is_greeting and not is_system:
        return {
            "messages": [AIMessage(content="The query is out of context.")],
            "next_step": "respond",
            "tool_result": None,
            "pending_tool_call": None,
        }

    if has_recent_tool_call:
        # A tool has already executed for this turn: unbind tools so the LLM is forced to synthesize a final text response
        llm_with_tools = llm
        context = []
    elif is_tool_intent and has_tool_context:
        # Tool-intent detected on initial turn: force the LLM to call a tool and strip RAG context
        # so the LLM doesn't get confused by irrelevant document excerpts
        llm_with_tools = llm.bind_tools(tools, tool_choice="any")
        context = []  # Clear RAG context to prevent document-based answers
        print(f"[REASONING] TOOL-INTENT detected for '{question_lower}' — forcing tool_choice='any', clearing RAG context")
    elif is_system and has_tool_context:
        # System notification detected (e.g. graph resume from human approval):
        # Force the LLM to pick a tool (like Gmail) to carry out the system's instructions
        llm_with_tools = llm.bind_tools(tools, tool_choice="any")
        context = []
        print(f"[REASONING] SYSTEM-INTENT detected — forcing tool_choice='any', clearing RAG context")
    elif has_tool_context:
        llm_with_tools = llm.bind_tools(tools)
    else:
        llm_with_tools = llm

    system_msg = SystemMessage(content=_build_system_prompt(context, has_recent_tool_call))
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
