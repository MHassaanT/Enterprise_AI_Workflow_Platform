"""
Sales Agent Router — FastAPI.

Exposes endpoints for running the autonomous 6-stage AI SDR pipeline,
managing ICP configurations, and setting Apollo API Keys.
"""
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from config import settings
from graph.sales.graph import sales_head_graph
from services.db_client import execute_db_query

router = APIRouter()


class SalesPipelineRunRequest(BaseModel):
    tenant_id: str
    target_domain: Optional[str] = None
    icp_config: Optional[Dict[str, Any]] = None
    user_id: str = "sales_sdr"


class ApolloKeyRequest(BaseModel):
    tenant_id: str
    apollo_api_key: str


class ICPConfigRequest(BaseModel):
    tenant_id: str
    target_industries: List[str] = Field(default_factory=list)
    target_titles: List[str] = Field(default_factory=list)
    company_size_min: int = 10
    company_size_max: int = 1000
    battlecard_notes: str = ""
    playbook_strategy: str = ""


@router.post("/run")
async def run_sales_agent(
    request: SalesPipelineRunRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    run_id = f"sdr-run-{Date_now_id()}"

    initial_state = {
        "tenant_id": request.tenant_id,
        "run_id": run_id,
        "user_id": request.user_id,
        "target_domain": request.target_domain,
        "icp_config": request.icp_config or {},
        "raw_accounts": [],
        "scraped_context": {},
        "account_fit_passed": True,
        "discovered_contact": None,
        "deliverability_result": None,
        "icp_score": 0.0,
        "generated_outreach": None,
        "outreach_sent": False,
        "gmail_message_id": None,
        "deal_stage": "DISCOVERED",
        "quote_details": None,
        "logs": [],
        "answer": "",
    }

    config = {"configurable": {"thread_id": run_id}}

    try:
        final_state = await sales_head_graph.ainvoke(initial_state, config=config)
        return {
            "success": True,
            "run_id": run_id,
            "answer": final_state.get("answer", "Sales SDR execution complete."),
            "icp_score": final_state.get("icp_score"),
            "discovered_contact": final_state.get("discovered_contact"),
            "deliverability_result": final_state.get("deliverability_result"),
            "generated_outreach": final_state.get("generated_outreach"),
            "deal_stage": final_state.get("deal_stage"),
            "gmail_message_id": final_state.get("gmail_message_id"),
            "logs": final_state.get("logs", []),
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Sales agent execution failed: {str(e)}")


@router.post("/apollo-key")
async def save_apollo_key(
    request: ApolloKeyRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    query = """
    INSERT INTO tenant_apollo_settings (tenant_id, apollo_api_key, is_valid, updated_at)
    VALUES ($1, $2, TRUE, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET apollo_api_key = EXCLUDED.apollo_api_key, is_valid = TRUE, updated_at = NOW();
    """
    await execute_db_query(query, [request.tenant_id, request.apollo_api_key])
    return {"success": True, "message": "Apollo Master API Key saved successfully."}


@router.get("/apollo-key/{tenant_id}")
async def get_apollo_key_status(
    tenant_id: str,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    query = "SELECT is_valid, updated_at FROM tenant_apollo_settings WHERE tenant_id = $1;"
    res = await execute_db_query(query, [tenant_id])
    if res and res.get("rows"):
        return {"configured": True, "is_valid": res["rows"][0]["is_valid"]}
    return {"configured": False, "is_valid": False}


@router.post("/icp")
async def save_icp_config(
    request: ICPConfigRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    import json
    query = """
    INSERT INTO sales_icp_configs (
      tenant_id, target_industries, target_titles, company_size_min, company_size_max,
      battlecard_notes, playbook_strategy, updated_at
    ) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      target_industries = EXCLUDED.target_industries,
      target_titles = EXCLUDED.target_titles,
      company_size_min = EXCLUDED.company_size_min,
      company_size_max = EXCLUDED.company_size_max,
      battlecard_notes = EXCLUDED.battlecard_notes,
      playbook_strategy = EXCLUDED.playbook_strategy,
      updated_at = NOW();
    """
    await execute_db_query(query, [
        request.tenant_id,
        json.dumps(request.target_industries),
        json.dumps(request.target_titles),
        request.company_size_min,
        request.company_size_max,
        request.battlecard_notes,
        request.playbook_strategy,
    ])
    return {"success": True, "message": "ICP configuration updated."}


@router.get("/icp/{tenant_id}")
async def get_icp_config(
    tenant_id: str,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    query = "SELECT * FROM sales_icp_configs WHERE tenant_id = $1;"
    res = await execute_db_query(query, [tenant_id])
    if res and res.get("rows"):
        return {"success": True, "icp": res["rows"][0]}
    return {
        "success": True,
        "icp": {
            "target_industries": ["Software", "SaaS", "Fintech"],
            "target_titles": ["VP of Sales", "CTO", "Head of Growth"],
            "company_size_min": 10,
            "company_size_max": 1000,
            "battlecard_notes": "Key Differentiator: Zero vendor lock-in with 99.9% uptime SLA.",
            "playbook_strategy": "Focus on operational efficiency & rapid ROI.",
        }
    }


def Date_now_id():
    import time
    return int(time.time() * 1000)
