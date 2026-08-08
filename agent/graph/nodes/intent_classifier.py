"""
Intent Classifier Node — FLARE-style retrieval gate.

Determines whether the user's question requires document retrieval (RAG)
or can be handled with a direct tool call / general knowledge.

Ensures all product, business, policy, and document queries execute RAG retrieval,
while pure conversational greetings (hello, hi, thanks) skip retrieval.
Skips retrieval for queries that clearly need live tool execution (order lookups, etc.).
"""
from graph.state import AgentState

GREETINGS = {
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
    "thanks", "thank you", "bye", "goodbye"
}

# Queries matching these keywords need live tool data, not document excerpts
TOOL_INTENT_KEYWORDS = {
    "order status", "track order", "order details", "my order",
    "order id", "ord-", "shipping status", "delivery status",
    "check order", "where is my order", "track my", "tracking number",
    "order number", "order update", "check my order", "look up order",
    "lookup order", "find my order", "order info",
    "refund", "apply for refund", "request refund", "return order", "want a refund"
}


async def intent_classifier_node(state: AgentState) -> dict:
    question = (state.get("question") or "").strip().lower()

    # Skip RAG retrieval only for pure conversational greetings
    if question in GREETINGS or question == "system notification":
        return {"needs_retrieval": False}

    # Skip RAG for queries that clearly need tool execution (order lookups, etc.)
    # Letting RAG run here floods the LLM with document excerpts that compete with tool calls
    if any(kw in question for kw in TOOL_INTENT_KEYWORDS):
        return {"needs_retrieval": False}

    # All other product, service, and policy questions go through RAG retrieval
    return {"needs_retrieval": True}
