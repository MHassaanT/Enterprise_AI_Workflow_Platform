from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from graph.analytics.graph import analytics_agent_graph

router = APIRouter()

class AnalyticsQueryRequest(BaseModel):
    tenant_id: str
    user_query: Optional[str] = "Provide executive overview"
    intent: Optional[str] = "text_to_sql"

class ReportGenerateRequest(BaseModel):
    tenant_id: str
    report_type: Optional[str] = "EXECUTIVE_DIGEST"

@router.post("/query")
async def query_analytics(request: AnalyticsQueryRequest, req: Request):
    """
    Executes an analytical query via the Analytics Agent LangGraph workflow.
    Supports natural language search, quickview compilation, and digest creation.
    """
    try:
        initial_state = {
            "tenant_id": request.tenant_id,
            "user_query": request.user_query or "",
            "intent": request.intent or "text_to_sql",
            "generated_sql": None,
            "execution_results": None,
            "visualization_type": None,
            "visualization_config": None,
            "insights_summary": None,
            "quickview_data": None,
            "anomaly_alerts": None,
            "status": "idle",
            "error_message": None
        }

        config = {"configurable": {"thread_id": f"analytics_{request.tenant_id}"}}
        final_state = analytics_agent_graph.invoke(initial_state, config)

        return {
            "status": "success",
            "tenant_id": request.tenant_id,
            "intent": final_state.get("intent"),
            "data": {
                "user_query": final_state.get("user_query"),
                "quickview": final_state.get("quickview_data"),
                "generated_sql": final_state.get("generated_sql"),
                "execution_results": final_state.get("execution_results"),
                "visualization_config": final_state.get("visualization_config"),
                "insights_summary": final_state.get("insights_summary")
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/quickview")
async def get_quickview_summary(tenant_id: str = "default"):
    """
    Returns executive quickview summary for instant dashboard widgets.
    """
    try:
        initial_state = {
            "tenant_id": tenant_id,
            "user_query": "quickview",
            "intent": "quickview",
            "status": "idle"
        }
        config = {"configurable": {"thread_id": f"quickview_{tenant_id}"}}
        final_state = analytics_agent_graph.invoke(initial_state, config)
        return {
            "status": "success",
            "tenant_id": tenant_id,
            "quickview": final_state.get("quickview_data")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reports/generate")
async def generate_executive_report(request: ReportGenerateRequest):
    """
    Generates structured executive report briefing.
    """
    try:
        initial_state = {
            "tenant_id": request.tenant_id,
            "user_query": "executive digest report",
            "intent": "executive_digest",
            "status": "idle"
        }
        config = {"configurable": {"thread_id": f"report_{request.tenant_id}"}}
        final_state = analytics_agent_graph.invoke(initial_state, config)
        return {
            "status": "success",
            "tenant_id": request.tenant_id,
            "report": {
                "title": "Executive AI Analytics Digest",
                "markdown": final_state.get("insights_summary")
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
