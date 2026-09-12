from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from services.db_client import execute_db_query

router = APIRouter()

class FinanceTaskRequest(BaseModel):
    task_type: str
    tenant_id: str
    payload: Dict[str, Any] = {}

class BudgetUpdateRequest(BaseModel):
    tenant_id: Optional[str] = "00000000-0000-0000-0000-000000000000"
    budgets: Optional[List[Dict[str, Any]]] = None
    budget: Optional[List[Dict[str, Any]]] = None

@router.get("/budget")
@router.get("/budgets")
async def get_budget(req: Request, tenant_id: Optional[str] = None):
    """
    Fetches departmental budgets from finance_budgets and department_budgets tables.
    """
    tid = tenant_id or req.headers.get("x-tenant-id") or "00000000-0000-0000-0000-000000000000"
    try:
        res = await execute_db_query(
            "SELECT department, budget_amount FROM finance_budgets WHERE tenant_id::text = $1 ORDER BY department;",
            [str(tid)],
            tenant_id=str(tid)
        )
        rows = res.get("rows", []) if res else []
        if not rows:
            res2 = await execute_db_query(
                "SELECT department, total_budget as budget_amount FROM department_budgets WHERE tenant_id::text = $1 ORDER BY department;",
                [str(tid)],
                tenant_id=str(tid)
            )
            rows = res2.get("rows", []) if res2 else []

        return {
            "success": True,
            "budgets": rows,
            "budget": rows
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/budget")
@router.post("/budgets")
async def save_budget(req: Request, request: Optional[BudgetUpdateRequest] = None):
    """
    Saves or updates departmental budgets.
    """
    tid = req.headers.get("x-tenant-id") or (request.tenant_id if request else "00000000-0000-0000-0000-000000000000")
    try:
        body = await req.json() if not request else request.model_dump()
    except Exception:
        body = request.model_dump() if request else {}
    
    budget_list = body.get("budgets") or body.get("budget") or (body if isinstance(body, list) else [])
    if isinstance(budget_list, dict):
        budget_list = [budget_list]

    for b in budget_list:
        dept = b.get("department")
        amt = float(b.get("budget_amount", b.get("amount", b.get("total_budget", 0))))
        if dept:
            await execute_db_query(
                """INSERT INTO finance_budgets (tenant_id, department, budget_amount, updated_at)
                   VALUES ($1::uuid, $2, $3, NOW())
                   ON CONFLICT (tenant_id, department)
                   DO UPDATE SET budget_amount = EXCLUDED.budget_amount, updated_at = NOW();""",
                [str(tid), dept, amt],
                tenant_id=str(tid)
            )
    return {"success": True, "message": "Budgets saved successfully."}

@router.get("/status")
async def get_finance_status(req: Request, tenant_id: Optional[str] = None):
    """
    Returns connection status for SafePay and Stripe payment accounts.
    """
    from services.finance_service import get_payment_integrations_status
    tid = tenant_id or req.headers.get("x-tenant-id") or "00000000-0000-0000-0000-000000000000"
    try:
        status = await get_payment_integrations_status(tid)
        return {"success": True, "tenant_id": tid, "status": status}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/overview")
async def get_finance_overview(
    req: Request,
    tenant_id: Optional[str] = None,
    provider: Optional[str] = "all",
    period_days: Optional[int] = 30,
):
    """
    Retrieves the combined (or single-provider) financial overview,
    including KPI metrics, daily inflow/outflow timeline for graphs,
    gateway volume distribution, and recent transactions.
    """
    from services.finance_service import fetch_unified_finance_overview
    tid = tenant_id or req.headers.get("x-tenant-id") or "00000000-0000-0000-0000-000000000000"
    try:
        data = await fetch_unified_finance_overview(
            tenant_id=tid,
            view_mode=(provider or "all").lower(),
            period_days=period_days or 30,
        )
        return {"success": True, "tenant_id": tid, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transactions")
async def get_finance_transactions(
    req: Request,
    tenant_id: Optional[str] = None,
    provider: Optional[str] = "all",
    status: Optional[str] = "all",
    search: Optional[str] = None,
    limit: Optional[int] = 50,
):
    """
    Returns filterable, searchable transaction reports across connected payment accounts.
    """
    from services.finance_service import fetch_unified_finance_overview
    tid = tenant_id or req.headers.get("x-tenant-id") or "00000000-0000-0000-0000-000000000000"
    try:
        data = await fetch_unified_finance_overview(
            tenant_id=tid,
            view_mode=(provider or "all").lower(),
            period_days=90,
        )
        txs = data.get("transactions", [])

        # Filter by status if specified
        if status and status.lower() != "all":
            txs = [t for t in txs if t.get("status", "").lower() == status.lower()]

        # Filter by provider if specified
        if provider and provider.lower() != "all":
            txs = [t for t in txs if t.get("provider", "").lower() == provider.lower()]

        # Filter by search string
        if search:
            s_low = search.lower()
            txs = [
                t for t in txs
                if s_low in str(t.get("customer_name", "")).lower()
                or s_low in str(t.get("customer_email", "")).lower()
                or s_low in str(t.get("description", "")).lower()
                or s_low in str(t.get("id", "")).lower()
            ]

        return {
            "success": True,
            "count": len(txs),
            "transactions": txs[:limit],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/insights")
async def get_financial_insights(req: Request, payload: Optional[Dict[str, Any]] = None):
    """
    Generates AI executive financial briefing and cashflow analysis via Gemini.
    """
    from services.finance_service import fetch_unified_finance_overview, generate_ai_financial_insights
    tid = req.headers.get("x-tenant-id") or (payload.get("tenant_id") if payload else "00000000-0000-0000-0000-000000000000")
    try:
        overview = await fetch_unified_finance_overview(tenant_id=tid, view_mode="all", period_days=30)
        insights = await generate_ai_financial_insights(overview)
        return {"success": True, "insights": insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run-task")
async def run_finance_task(request: FinanceTaskRequest, req: Request):
    """
    Foundational endpoint for the Finance Agent.
    Handles tasks like generating weekly financial summaries,
    anomalous spending alerts, or payment gateway audits.
    """
    internal_token = req.headers.get("x-internal-token")

    try:
        if request.task_type == "generate_summary" or request.task_type == "payment_overview":
            from services.finance_service import fetch_unified_finance_overview
            tid = request.tenant_id or "00000000-0000-0000-0000-000000000000"
            overview = await fetch_unified_finance_overview(tenant_id=tid, view_mode="all", period_days=30)
            return {
                "status": "success",
                "message": "Financial overview retrieved successfully.",
                "data": {
                    "summary": "Multi-account payment intelligence aggregated across connected gateways.",
                    "overview": overview
                }
            }
        elif request.task_type in ("get_budget", "query_budget", "budget"):
            tid = request.tenant_id or "00000000-0000-0000-0000-000000000000"
            res = await execute_db_query(
                "SELECT department, budget_amount FROM finance_budgets WHERE tenant_id::text = $1 ORDER BY department;",
                [str(tid)],
                tenant_id=str(tid)
            )
            return {
                "status": "success",
                "message": "Budget fetched successfully.",
                "data": {"budgets": res.get("rows", [])}
            }
        else:
            return {
                "status": "success",
                "message": f"Task {request.task_type} received."
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

