"""
Retriever Node — fetches relevant document chunks from the RAG backend.

Skips execution if intent_classifier marked needs_retrieval=False.
All Qdrant access stays in Node.js; this node is a thin HTTP client.
"""
from graph.state import AgentState
from services.rag_client import query_rag
from services.db_client import write_audit_log


async def retriever_node(state: AgentState) -> dict:
    # FLARE-style skip: tool-only queries bypass retrieval
    if not state.get("needs_retrieval", True):
        return {}

    result = await query_rag(state["question"], state["tenant_id"])

    # Audit log every retrieval query (required per spec section 13.4)
    await write_audit_log(
        state["tenant_id"],
        "rag_query",
        {
            "question": state["question"],
            "conversationId": state["conversation_id"],
            "chunksRetrieved": len(result.get("chunks", [])),
        },
    )

    return {
        "context": result.get("chunks", []),
        "citations": result.get("citations", []),
    }
