import httpx
from config import settings

async def get_all_hr_resumes(tenant_id: str, job_description_id: str) -> list:
    """
    Retrieves ALL resume chunks for a given job description from the Node.js backend to ensure full context for LLM extraction.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"{settings.BACKEND_URL}/internal/hr/resumes/{job_description_id}?tenantId={tenant_id}",
            headers={"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN},
        )
        response.raise_for_status()
        data = response.json()
        return data.get("chunks", [])
