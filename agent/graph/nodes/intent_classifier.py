"""
Intent Classifier Node — Minimal FLARE-style retrieval gate.

Only skips RAG for greetings and system notifications.
All other queries go through RAG retrieval — the reasoning node
decides whether to use document context or tools.
"""
from graph.state import AgentState

GREETINGS = {
    "hello", "hi", "hey", "good morning", "good afternoon", "good evening",
    "thanks", "thank you", "bye", "goodbye", "see you", "talk later",
}


async def intent_classifier_node(state: AgentState) -> dict:
    question = (state.get("question") or "").strip().lower()

    # Skip RAG retrieval only for pure conversational greetings and system notifications
    if question in GREETINGS or question == "system notification":
        return {"needs_retrieval": False}

    # All other queries go through RAG retrieval
    return {"needs_retrieval": True}
