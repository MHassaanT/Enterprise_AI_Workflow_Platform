"""
Reasoning Node — Dynamic LLM brain. NO hardcoded business logic.

Receives: conversation history + retrieved context + tool results + tenant context
Produces: either a final answer (next_step="respond") or a tool call (next_step="tool_call")

Uses the LLM gateway abstraction — Gemini or Ollama, env-switched.
Uses dynamic system prompt built from tenant entity schema and agent configuration.
"""
from langchain_core.messages import SystemMessage, AIMessage, ToolMessage, HumanMessage
from graph.state import AgentState
from services.llm_gateway import get_llm
from services.agent_context_client import build_dynamic_system_prompt
from tool_gateway.registry import get_tools_for_agent, get_allowed_tool_bindings

MAX_TOOL_RETRIES = 3  # Circuit breaker: max consecutive tool call attempts
MAX_TOOL_CALLS_PER_TURN = 5  # Default max tool calls per conversation turn


async def reasoning_node(state: AgentState) -> dict:
    llm = get_llm()
    agent_id = state.get("agent_instance_id") or "default"
    tenant_id = state.get("tenant_id") or ""

    # Fetch tenant context and tools
    tenant_context = state.get("tenant_context", {})
    tools = await get_tools_for_agent(agent_id, tenant_context=tenant_context)
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

    # Map tool names to whether they require human approval based on ToolBinding DB config
    high_risk_map = {
        b["tool_name"]: b.get("is_high_risk", False) for b in bindings
    }

    # Read tenant agent config for per-turn limits
    agent_config = tenant_context.get("agent_context", {})
    entities = tenant_context.get("entities", [])
    company = tenant_context.get("company", {})
    max_calls = agent_config.get("max_tool_calls_per_turn", MAX_TOOL_CALLS_PER_TURN)

    # Tool call budget enforcement
    tool_call_count = state.get("tool_call_count", 0)
    if tool_call_count >= max_calls:
        print(f"[REASONING] Tool call budget exhausted: {tool_call_count}/{max_calls} for agent={agent_id}")
        return {
            "messages": [AIMessage(content=(
                "I've gathered as much information as I can. Let me summarize what I found and "
                "escalate the remaining questions to a human agent who can dig deeper."
            ))],
            "next_step": "respond",
            "tool_result": None,
            "pending_tool_call": None,
        }

    # Diagnostic logging
    tool_names = [t.name for t in tools] if tools else []
    print(f"[REASONING] Agent={agent_id} | Tools bound: {tool_names} | Bindings count: {len(bindings)} | Context chunks: {len(state.get('context', []))}")

    # Build dynamic tool descriptions for the system prompt
    tool_descriptions = "\n".join(
        [f"- {t.name}: {t.description}" for t in tools]
    ) if tools else "No tools available."

    # Build RAG context string
    context = state.get("context", [])
    rag_context = "\n\n".join(
        f"[{i+1}] (Source: {c.get('documentName', 'Unknown')})\n{c.get('text', '')}"
        for i, c in enumerate(context)
    ) if context else ""

    # Build the dynamic system prompt from tenant configuration
    system_prompt = build_dynamic_system_prompt(
        agent_config, entities, company, tool_descriptions, rag_context
    )

    # Bind tools to LLM if available
    llm_with_tools = llm.bind_tools(tools) if tools else llm

    system_msg = SystemMessage(content=system_prompt)
    history = list(state["messages"])

    response: AIMessage = await llm_with_tools.ainvoke([system_msg] + history)

    # ── Tool call requested ──
    if hasattr(response, "tool_calls") and response.tool_calls:
        call = response.tool_calls[0]
        tool_name = call["name"]

        # Determine high-risk status from DB bindings only — no hardcoded set
        is_high_risk = high_risk_map.get(tool_name, False)

        # If we're resuming from an approval decision, don't re-flag as high-risk
        is_resuming = state.get("approval_status") in ["approved", "rejected"]
        if is_resuming:
            is_high_risk = False

        return {
            "messages": [response],
            "next_step": "tool_call",
            "pending_tool_call": {
                "name": tool_name,
                "arguments": call["args"],
                "id": call.get("id", tool_name),
            },
            "is_high_risk": is_high_risk,
            "tool_call_count": tool_call_count + 1,
        }

    # ── Final answer ──
    return {
        "messages": [response],
        "next_step": "respond",
        "tool_result": None,
        "pending_tool_call": None,
        "tool_call_count": 0,  # Reset for next turn
    }
