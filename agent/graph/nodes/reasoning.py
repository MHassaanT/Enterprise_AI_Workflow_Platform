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

Your responsibilities:
- Answer customer questions accurately using the provided document excerpts.
- Use available tools to look up specific information (order status, account details).
- Escalate high-risk or ungrounded actions to human approval when needed.

Rules:
- Keep your answers concise, direct, and focused on the exact question (1-2 sentences).
- Do NOT dump extra background details, categories, or target geographies unless explicitly asked.
- Do NOT include any citation markers like [1], [2], or source labels in your response.
- Do NOT invent information not present in documents or tool results.
- If the answer is not present in the document excerpts and cannot be answered accurately, explicitly call the escalate_to_human tool to request human assistance.
- For high-risk or irreversible actions (such as refunds, payments, or account changes), call the escalate_to_human tool for approval.
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
    
    # Map tool names to whether they require human approval based on ToolBinding DB config
    high_risk_map = {
        b["tool_name"]: b.get("is_high_risk", False) for b in bindings
    }

    llm_with_tools = llm.bind_tools(tools) if tools else llm

    system_msg = SystemMessage(content=_build_system_prompt(state.get("context", [])))
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
