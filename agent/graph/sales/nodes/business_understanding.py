"""
Stage 1: Business Understanding & Lead Sourcing Node.
Ingests ICP parameters, competitor battlecards, and queries candidate accounts via Apollo API.
"""
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from tool_gateway.apollo_mcp import search_apollo_accounts_impl
from services.db_client import execute_db_query


def _normalize_uuid(tenant_id: str) -> str:
    if not tenant_id or len(tenant_id) < 30 or tenant_id in ("default_tenant", "sales_sdr"):
        return "00000000-0000-0000-0000-000000000000"
    return tenant_id


async def business_understanding_node(state: SalesAgentState) -> Dict[str, Any]:
    tenant_id = _normalize_uuid(state.get("tenant_id", ""))
    logs = list(state.get("logs", []))
    prospect_limit = state.get("prospect_limit") or 5

    # 1. Fetch ICP Configuration from Database or State
    icp = state.get("icp_config") or {}
    if not icp or not icp.get("target_industries"):
        try:
            query = "SELECT * FROM sales_icp_configs WHERE tenant_id = $1;"
            res = await execute_db_query(query, [tenant_id])
            if res and res.get("rows"):
                icp = res["rows"][0]
        except Exception:
            pass

    if not icp:
        icp = {
            "target_industries": ["Software", "SaaS", "Fintech", "HealthTech", "E-Commerce"],
            "target_titles": ["VP of Sales", "CTO", "Head of Growth", "Chief Financial Officer", "Head of Procurement"],
            "company_size_min": 10,
            "company_size_max": 500,
            "battlecard_notes": "Key differentiator: Autonomous AI agent workflows with zero vendor lock-in.",
        }

    target_industries = icp.get("target_industries", ["Software", "SaaS"])
    if isinstance(target_industries, str):
        import json
        try:
            target_industries = json.loads(target_industries)
        except Exception:
            target_industries = [target_industries]

    # 2. Query Candidate Target Accounts (Apollo API Sourcing)
    fetch_limit = max(prospect_limit * 3, 30)
    sourcing_res = await search_apollo_accounts_impl(
        tenant_id=tenant_id,
        target_industries=target_industries,
        company_size_min=icp.get("company_size_min", 10),
        company_size_max=icp.get("company_size_max", 500),
        limit=fetch_limit
    )

    accounts: List[Dict[str, Any]] = sourcing_res.get("accounts", [])
    
    # Prioritize specific target domain if provided
    if state.get("target_domain"):
        target_domain = state["target_domain"].replace("http://", "").replace("https://", "").strip("/")
        accounts = [{"company_name": target_domain.split(".")[0].title(), "domain": target_domain, "industry": target_industries[0]}] + accounts

    logs.append({
        "stage": "Stage 1: Business Understanding & Sourcing",
        "status": "COMPLETED",
        "details": f"Ingested ICP criteria. Sourced candidate target accounts via Apollo API (Target valid prospects: {prospect_limit}, Sourced candidates: {len(accounts)})."
    })

    return {
        "tenant_id": tenant_id,
        "icp_config": icp,
        "raw_accounts": accounts,
        "logs": logs,
    }
