"""
Finance Agent Router — FastAPI
"""
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from config import settings
from graph.finance.graph import finance_head_graph

router = APIRouter()

class FinanceRunRequest(BaseModel):
    tenant_id: str
    conversation_id: str
    user_id: str = "finance_user"
    subagent_target: str = "invoice_ingestion" # 'invoice_ingestion' | 'invoice_reconciliation' | 'payment_execution' | 'budget_clearance'
    invoice_data: Optional[Dict[str, Any]] = None
    po_number: Optional[str] = None
    department: Optional[str] = None
    clearance_amount: Optional[float] = None
    approval_id: Optional[str] = None
    approval_status: Optional[str] = None

class FinanceRunResponse(BaseModel):
    answer: str
    match_status: Optional[str] = None
    anomalies: Optional[List[str]] = None
    approval_id: Optional[str] = None
    approval_status: Optional[str] = None
    citations: List[Dict[str, Any]] = []
    budget_clearance_result: Optional[Dict[str, Any]] = None
    payment_result: Optional[Dict[str, Any]] = None

@router.post("/run", response_model=FinanceRunResponse)
async def run_finance_agent(
    request: FinanceRunRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    initial_state = {
        "tenant_id": request.tenant_id,
        "conversation_id": request.conversation_id,
        "user_id": request.user_id,
        "subagent_target": request.subagent_target,
        "invoice_data": request.invoice_data,
        "po_number": request.po_number,
        "department": request.department,
        "clearance_amount": request.clearance_amount,
        "approval_id": request.approval_id,
        "approval_status": request.approval_status,
        "rag_policy_context": [],
        "po_record": None,
        "match_status": None,
        "anomalies": [],
        "payment_draft": None,
        "payment_result": None,
        "budget_clearance_result": None,
        "answer": "",
        "citations": [],
        "audit_logged": False,
    }

    config = {"configurable": {"thread_id": request.conversation_id}}

    try:
        final_state = await finance_head_graph.ainvoke(initial_state, config=config)
        return FinanceRunResponse(
            answer=final_state.get("answer", "Finance execution complete."),
            match_status=final_state.get("match_status"),
            anomalies=final_state.get("anomalies"),
            approval_id=final_state.get("approval_id"),
            approval_status=final_state.get("approval_status"),
            citations=final_state.get("citations", []),
            budget_clearance_result=final_state.get("budget_clearance_result"),
            payment_result=final_state.get("payment_result"),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Finance agent execution failed: {str(e)}")
