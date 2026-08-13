import httpx
from config import settings

async def query_hr_resumes(query_vector: list, tenant_id: str, job_description_id: str, limit: int = 50) -> list:
    """
    Retrieves relevant resume chunks for a given job description from the Node.js backend.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{settings.BACKEND_URL}/internal/hr/search-resumes",
            json={
                "tenantId": tenant_id,
                "jobDescriptionId": jobDescriptionId,
                "queryVector": query_vector,
                "limit": limit
            },
            headers={"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN},
        )
        response.raise_for_status()
        data = response.json()
        return data.get("chunks", [])
