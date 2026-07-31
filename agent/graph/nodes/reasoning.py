"""
Reasoning Node — the LLM brain of the agent.

Receives: conversation history + retrieved context + tool results
Produces: either a final answer (next_step="respond") or a tool call (next_step="tool_call")

Uses the LLM gateway abstraction — Gemini or Ollama, env-switched.
"""
from langchain_core.messages import SystemMessage, AIMessage, ToolMessage
from graph.state import AgentState
from services.llm_gateway import get_llm
from tool_gateway.registry import get_tools_for_agent

# Actions that always require human approval before execution
HIGH_RISK_TOOLS = {"escalate_to_human", "issue_refund", "process_payment"}


def _build_system_prompt(context: list[dict]) -> str:
    prompt = """You are a helpful Customer Support AI agent for an enterprise platform.

Your responsibilities:
- Answer customer questions accurately using the provided document excerpts
- Use available tools to look up specific information (order status, account details)
- Escalate to a human when you cannot resolve an issue or a sensitive action is needed

Rules:
- Keep your answers concise, direct, and focused on the exact question (1-2 sentences).
- Do NOT dump extra background details, categories, or target geographies unless explicitly asked.
- Do NOT include any citation markers like [1], [2], or source labels in your response.
- Do NOT invent information not present in documents or tool results
- If the answer is not in the documents, say so and offer to escalate
- For refund, credit, sensitive actions, or whenever the customer requests human escalation or human support — ALWAYS call the escalate_to_human tool.
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
    tools = await get_tools_for_agent(state["agent_instance_id"])
    llm_with_tools = llm.bind_tools(tools) if tools else llm

    system_msg = SystemMessage(content=_build_system_prompt(state.get("context", [])))
    history = list(state["messages"])

    response: AIMessage = await llm_with_tools.ainvoke([system_msg] + history)

    # ── Tool call requested ──
    if hasattr(response, "tool_calls") and response.tool_calls:
        call = response.tool_calls[0]
        return {
            "messages": [response],
            "next_step": "tool_call",
            "pending_tool_call": {
                "name": call["name"],
                "arguments": call["args"],
                "id": call.get("id", call["name"]),  # OpenAI requires exact tool_call_id match
            },
            "is_high_risk": call["name"] in HIGH_RISK_TOOLS,
        }

    # ── Final answer ──
    return {
        "messages": [response],
        "next_step": "respond",
        "tool_result": None,
    }
