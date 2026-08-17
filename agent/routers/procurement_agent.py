"""
Procurement Agent Router — FastAPI
"""
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from config import settings
from graph.procurement.graph import procurement_head_graph

router = APIRouter()

class ProcurementRunRequest(BaseModel):
    tenant_id: str
    conversation_id: str
    user_id: str = "procurement_user"
    subagent_target: str = "vendor_bid" # 'vendor_bid' | 'procurement_budget' | 'po_execution'
    bid_data: Optional[Dict[str, Any]] = None
    department: Optional[str] = "Engineering"
    approval_id: Optional[str] = None
    approval_status: Optional[str] = None

class ProcurementRunResponse(BaseModel):
    answer: str
    compliance_status: Optional[str] = None
    budget_clearance_status: Optional[str] = None
    budget_clearance_token: Optional[str] = None
    approval_id: Optional[str] = None
    approval_status: Optional[str] = None
    citations: List[Dict[str, Any]] = []
    po_record: Optional[Dict[str, Any]] = None

@router.post("/run", response_model=ProcurementRunResponse)
async def run_procurement_agent(
    request: ProcurementRunRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    initial_state = {
        "tenant_id": request.tenant_id,
        "conversation_id": request.conversation_id,
        "user_id": request.user_id,
        "subagent_target": request.subagent_target,
        "bid_data": request.bid_data,
        "department": request.department,
        "rag_policy_context": [],
        "citations": [],
        "compliance_status": None,
        "budget_clearance_status": None,
        "budget_clearance_token": None,
        "approval_id": request.approval_id,
        "approval_status": request.approval_status,
        "po_record": None,
        "answer": "",
        "audit_logged": False,
    }

    config = {"configurable": {"thread_id": request.conversation_id}}

    try:
        final_state = await procurement_head_graph.ainvoke(initial_state, config=config)
        return ProcurementRunResponse(
            answer=final_state.get("answer", "Procurement execution complete."),
            compliance_status=final_state.get("compliance_status"),
            budget_clearance_status=final_state.get("budget_clearance_status"),
            budget_clearance_token=final_state.get("budget_clearance_token"),
            approval_id=final_state.get("approval_id"),
            approval_status=final_state.get("approval_status"),
            citations=final_state.get("citations", []),
            po_record=final_state.get("po_record"),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Procurement agent execution failed: {str(e)}")
