"""
RAG client — calls the Node.js backend's internal RAG query endpoint.
Keeps a single source of truth: all Qdrant access remains in Node.js.
"""
import httpx
from config import settings


async def query_rag(question: str, tenant_id: str) -> dict:
    """
    Retrieves relevant document chunks for a question within a tenant's scope.

    Returns:
        {
            "chunks": [{text, documentName, section, page, score}, ...],
            "citations": [{id, documentId, documentName, section, page, score, excerpt}, ...]
        }
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{settings.BACKEND_URL}/internal/rag/query",
            json={"question": question, "tenantId": tenant_id},
            headers={"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN},
        )
        response.raise_for_status()
        data = response.json()
        return {
            "chunks": data.get("chunks", []),
            "citations": data.get("citations", []),
        }
