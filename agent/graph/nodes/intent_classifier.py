"""
Intent Classifier Node — FLARE-style retrieval gate.

Determines whether the user's question requires document retrieval (RAG)
or can be handled with a direct tool call / general knowledge.

Skipping unnecessary retrieval reduces latency and cost on tool-only queries
like "what is the status of order ORD-123?" — per spec section 9.3.
"""
from langchain_core.messages import HumanMessage, SystemMessage
from graph.state import AgentState
from services.llm_gateway import get_llm

_SYSTEM_PROMPT = """You are a routing classifier for a customer support AI system.

Decide whether the user's question requires searching through business documents (policies, procedures, product details) or can be resolved with a specific tool call or general knowledge.

Respond with EXACTLY one word — nothing else:
- RETRIEVE  → question requires document knowledge (policies, how-tos, product specs, terms)
- SKIP      → question is a specific lookup (order status, account info) or a greeting

Examples:
"What is your return policy?" → RETRIEVE
"What's the status of order ORD-123?" → SKIP
"How does the warranty work?" → RETRIEVE
"Hello, I need help" → SKIP
"Can I get a refund?" → RETRIEVE
"Where is my package?" → SKIP
"""


async def intent_classifier_node(state: AgentState) -> dict:
    llm = get_llm()
    response = await llm.ainvoke([
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=state["question"]),
    ])
    needs_retrieval = "RETRIEVE" in response.content.strip().upper()
    return {"needs_retrieval": needs_retrieval}
