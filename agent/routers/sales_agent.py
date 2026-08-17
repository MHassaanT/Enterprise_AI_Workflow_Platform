"""
Sales Agent Router — FastAPI
"""
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from config import settings
from graph.sales.graph import sales_head_graph

router = APIRouter()

class SalesRunRequest(BaseModel):
    tenant_id: str
    conversation_id: str
    user_id: str = "sales_user"
    subagent_target: str = "lead_pricing" # 'lead_pricing' | 'deal_negotiation' | 'sales_financial_sync'
    customer_email: str = "customer@enterprise.com"
    tier_requested: str = "Enterprise"
    requested_discount: Optional[float] = 10.0
    approval_id: Optional[str] = None
    approval_status: Optional[str] = None

class SalesRunResponse(BaseModel):
    answer: str
    quote_details: Optional[Dict[str, Any]] = None
    deal_stage: Optional[str] = None
    approval_id: Optional[str] = None
    approval_status: Optional[str] = None
    citations: List[Dict[str, Any]] = []
    financial_sync_result: Optional[Dict[str, Any]] = None

@router.post("/run", response_model=SalesRunResponse)
async def run_sales_agent(
    request: SalesRunRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    initial_state = {
        "tenant_id": request.tenant_id,
        "conversation_id": request.conversation_id,
        "user_id": request.user_id,
        "subagent_target": request.subagent_target,
        "customer_email": request.customer_email,
        "tier_requested": request.tier_requested,
        "requested_discount": request.requested_discount,
        "lead_data": None,
        "rag_policy_context": [],
        "citations": [],
        "quote_details": None,
        "customer_accepted": True,
        "approval_id": request.approval_id,
        "approval_status": request.approval_status,
        "deal_stage": None,
        "financial_sync_result": None,
        "answer": "",
        "audit_logged": False,
    }

    config = {"configurable": {"thread_id": request.conversation_id}}

    try:
        final_state = await sales_head_graph.ainvoke(initial_state, config=config)
        return SalesRunResponse(
            answer=final_state.get("answer", "Sales execution complete."),
            quote_details=final_state.get("quote_details"),
            deal_stage=final_state.get("deal_stage"),
            approval_id=final_state.get("approval_id"),
            approval_status=final_state.get("approval_status"),
            citations=final_state.get("citations", []),
            financial_sync_result=final_state.get("financial_sync_result"),
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Sales agent execution failed: {str(e)}")
