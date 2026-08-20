from fastapi import APIRouter, HTTPException, Header, Body
from typing import Dict, Any, Optional
from agent.graph.procurement.supervisor import ProcurementSupervisor

router = APIRouter(prefix="/agent/procurement", tags=["Procurement Agent"])
supervisor = ProcurementSupervisor()

@router.post("/run-supervisor")
async def run_supervisor(
    payload: Dict[str, Any] = Body(...),
    x_internal_token: Optional[str] = Header(None)
):
    stage = payload.get("stage", "INTAKE")
    try:
        result = supervisor.run_stage(stage, payload)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Procurement Supervisor execution failed: {str(e)}")

@router.post("/subagent/intake")
async def run_intake_subagent(payload: Dict[str, Any] = Body(...)):
    return supervisor.run_stage("INTAKE", payload)

@router.post("/subagent/research")
async def run_research_subagent(payload: Dict[str, Any] = Body(...)):
    return supervisor.run_stage("RESEARCHED", payload)

@router.post("/subagent/rfq")
async def run_rfq_subagent(payload: Dict[str, Any] = Body(...)):
    return supervisor.run_stage("RFQ_DISPATCHED", payload)

@router.post("/subagent/negotiate")
async def run_negotiation_subagent(payload: Dict[str, Any] = Body(...)):
    return supervisor.run_stage("REPLIES_PARSED", payload)

@router.post("/subagent/select-vendor")
async def run_vendor_comms_subagent(payload: Dict[str, Any] = Body(...)):
    return supervisor.run_stage("AWAITING_SELECTION", payload)

@router.post("/subagent/sync-finance")
async def run_finance_sync_subagent(payload: Dict[str, Any] = Body(...)):
    return supervisor.run_stage("NOTIFIED", payload)
