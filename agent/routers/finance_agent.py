from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Dict, Any

router = APIRouter()

class FinanceTaskRequest(BaseModel):
    task_type: str
    tenant_id: str
    payload: Dict[str, Any]

@router.post("/run-task")
async def run_finance_task(request: FinanceTaskRequest, req: Request):
    """
    Foundational endpoint for the Finance Agent.
    Can be expanded to handle tasks like generating weekly financial summaries,
    anomalous spending alerts, or forecasting.
    """
    internal_token = req.headers.get("x-internal-token")
    # if internal_token != settings.INTERNAL_SERVICE_TOKEN: ...
    # (auth check placeholder)

    try:
        if request.task_type == "generate_summary":
            return {
                "status": "success",
                "message": "Financial summary generation triggered.",
                "data": {"summary": "All finances are operating within normal parameters."}
            }
        else:
            return {
                "status": "success",
                "message": f"Task {request.task_type} received."
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
