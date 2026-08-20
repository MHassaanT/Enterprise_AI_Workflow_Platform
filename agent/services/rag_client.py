"""
RAG client — calls the Node.js backend's internal RAG query endpoint.
Keeps a single source of truth: all Qdrant access remains in Node.js.
"""
import httpx
import logging
from config import settings

logger = logging.getLogger(__name__)


async def query_rag(question: str, tenant_id: str) -> dict:
    """
    Retrieves relevant document chunks for a question within a tenant's scope.

    Returns:
        {
            "chunks": [{text, documentName, section, page, score}, ...],
            "citations": [{id, documentId, documentName, section, page, score, excerpt}, ...]
        }
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
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
    except Exception as e:
        logger.warning(f"RAG query to {settings.BACKEND_URL}/internal/rag/query failed: {e}")
        return {"chunks": [], "citations": []}


async def fetch_all_tenant_chunks(tenant_id: str, limit: int = 40) -> list:
    """
    Fetches all uploaded Knowledge Base text chunks for a tenant without vector query constraints.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.BACKEND_URL}/internal/rag/all-chunks",
                json={"tenantId": tenant_id, "limit": limit},
                headers={"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN},
            )
            response.raise_for_status()
            data = response.json()
            return data.get("chunks", [])
    except Exception as e:
        logger.warning(f"Failed to fetch all tenant chunks from {settings.BACKEND_URL}/internal/rag/all-chunks: {e}")
        return []
