"""
Intent Classifier Node — FLARE-style retrieval gate.

Determines whether the user's question requires document retrieval (RAG)
or can be handled with a direct tool call / general knowledge.

Ensures all product, business, policy, and document queries execute RAG retrieval,
while pure conversational greetings (hello, hi, thanks) skip retrieval.
"""
from graph.state import AgentState

GREETINGS = {
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
    "thanks", "thank you", "bye", "goodbye"
}


async def intent_classifier_node(state: AgentState) -> dict:
    question = (state.get("question") or "").strip().lower()

    # Skip RAG retrieval only for pure conversational greetings
    if question in GREETINGS:
        return {"needs_retrieval": False}

    # Always execute RAG retrieval for all product, service, and policy questions
    return {"needs_retrieval": True}
