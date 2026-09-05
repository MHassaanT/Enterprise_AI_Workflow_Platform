"""
Reasoning Node — Dynamic LLM brain. NO hardcoded business logic.

Receives: conversation history + retrieved context + tool results + tenant context
Produces: either a final answer (next_step="respond") or a tool call (next_step="tool_call")

Uses the LLM gateway abstraction — Gemini or Ollama, env-switched.
Uses dynamic system prompt built from tenant entity schema and agent configuration.
"""
from langchain_core.messages import BaseMessage, SystemMessage, AIMessage, ToolMessage, HumanMessage
from graph.state import AgentState
from services.llm_gateway import get_llm
from services.agent_context_client import build_dynamic_system_prompt
from tool_gateway.registry import get_tools_for_agent, get_allowed_tool_bindings

MAX_TOOL_RETRIES = 3  # Circuit breaker: max consecutive tool call attempts
MAX_TOOL_CALLS_PER_TURN = 5  # Default max tool calls per conversation turn


def sanitize_message_history(messages: list[BaseMessage]) -> list[BaseMessage]:
    """
    Ensure every AIMessage with tool_calls is immediately followed by valid ToolMessages
    for all tool_call_ids declared by that assistant message, and filter out orphaned tool messages.
    This strictly satisfies OpenAI/OpenRouter's API invariant:
    'An assistant message with tool_calls must be followed by tool messages responding to each tool_call_id.'
    """
    if not messages:
        return []

    sanitized: list[BaseMessage] = []
    i = 0
    n = len(messages)

    while i < n:
        msg = messages[i]

        # 1. Handle AIMessage
        if isinstance(msg, AIMessage) or getattr(msg, "type", "") == "ai":
            tool_calls = getattr(msg, "tool_calls", None) or []
            if tool_calls:
                # Collect tool_call_ids declared on this AIMessage
                declared_ids = []
                for tc in tool_calls:
                    cid = tc.get("id") if isinstance(tc, dict) else getattr(tc, "id", None)
                    if not cid:
                        cname = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "tool")
                        cid = f"call_{cname}"
                        if isinstance(tc, dict):
                            tc["id"] = cid
                    declared_ids.append(cid)

                # Look ahead for existing ToolMessages responding to this AIMessage
                j = i + 1
                existing_tool_msgs = []
                while j < n and (isinstance(messages[j], ToolMessage) or getattr(messages[j], "type", "") == "tool"):
                    existing_tool_msgs.append(messages[j])
                    j += 1

                # Build a map of tool_call_id -> ToolMessage
                tool_msg_map = {}
                for tm in existing_tool_msgs:
                    t_id = getattr(tm, "tool_call_id", None)
                    if t_id and t_id not in tool_msg_map:
                        tool_msg_map[t_id] = tm

                sanitized.append(msg)

                # Ensure every declared_id has a ToolMessage
                for call_id in declared_ids:
                    if call_id in tool_msg_map:
                        sanitized.append(tool_msg_map[call_id])
                    else:
                        # Missing ToolMessage! Inject synthetic ToolMessage to repair history
                        print(f"[REASONING SANITIZER] Repairing orphaned tool_call_id={call_id}")
                        sanitized.append(
                            ToolMessage(
                                content="Action was not completed, cancelled, or superseded.",
                                tool_call_id=call_id,
                            )
                        )

                # Advance pointer past the tool messages we inspected
                i = j
                continue

            else:
                # Normal AIMessage without tool_calls
                # OpenAI requires content not to be empty if no tool calls
                content = getattr(msg, "content", "")
                if not content or (isinstance(content, str) and not content.strip()):
                    msg = AIMessage(content="I am processing your request.")
                sanitized.append(msg)
                i += 1
                continue

        # 2. Skip orphaned ToolMessage that was not consumed by a preceding AIMessage
        elif isinstance(msg, ToolMessage) or getattr(msg, "type", "") == "tool":
            print(f"[REASONING SANITIZER] Dropping orphaned ToolMessage id={getattr(msg, 'tool_call_id', None)}")
            i += 1
            continue

        # 3. All other messages (HumanMessage, SystemMessage, etc.)
        else:
            sanitized.append(msg)
            i += 1

    return sanitized


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
            "pending_tool_calls": None,
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
            "pending_tool_calls": None,
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
        agent_config,
        entities,
        company,
        tool_descriptions,
        rag_context,
        user_id=state.get("user_id") or "anonymous",
    )

    # Bind tools to LLM if available
    llm_with_tools = llm.bind_tools(tools) if tools else llm

    system_msg = SystemMessage(content=system_prompt)
    raw_history = list(state.get("messages", []))
    sanitized_history = sanitize_message_history(raw_history)

    response: AIMessage = await llm_with_tools.ainvoke([system_msg] + sanitized_history)

    # ── Tool call requested ──
    if hasattr(response, "tool_calls") and response.tool_calls:
        all_calls = response.tool_calls
        first_call = all_calls[0]
        first_tool_name = first_call["name"]

        # Determine high-risk status: true if ANY tool call is high-risk
        is_high_risk = any(high_risk_map.get(c["name"], False) for c in all_calls)

        # If we're resuming from an approval decision, don't re-flag as high-risk
        is_resuming = state.get("approval_status") in ["approved", "rejected"]
        if is_resuming:
            is_high_risk = False

        pending_tool_calls_list = [
            {
                "name": c["name"],
                "arguments": c["args"],
                "id": c.get("id", c["name"]),
            }
            for c in all_calls
        ]

        print(f"[REASONING] LLM requested {len(all_calls)} tool call(s): {[c['name'] for c in all_calls]}")

        return {
            "messages": [response],
            "next_step": "tool_call",
            "pending_tool_call": {
                "name": first_tool_name,
                "arguments": first_call["args"],
                "id": first_call.get("id", first_tool_name),
            },
            "pending_tool_calls": pending_tool_calls_list,
            "is_high_risk": is_high_risk,
            "tool_call_count": tool_call_count + len(all_calls),
        }

    # ── Final answer ──
    return {
        "messages": [response],
        "next_step": "respond",
        "tool_result": None,
        "pending_tool_call": None,
        "pending_tool_calls": None,
        "tool_call_count": 0,  # Reset for next turn
    }

