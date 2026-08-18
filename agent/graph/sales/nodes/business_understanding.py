"""
Stage 1: Business Understanding & Lead Sourcing Node.
Ingests ICP parameters, competitor battlecards, and queries candidate accounts via Apollo API.
"""
from typing import Dict, Any
from graph.sales.state import SalesAgentState
from tool_gateway.apollo_mcp import search_apollo_accounts_impl
from services.db_client import execute_db_query


async def business_understanding_node(state: SalesAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default_tenant")
    run_id = state.get("run_id", "run_1")
    logs = list(state.get("logs", []))

    # 1. Fetch ICP Configuration from Database or State
    icp = state.get("icp_config") or {}
    if not icp:
        try:
            query = "SELECT * FROM sales_icp_configs WHERE tenant_id = $1;"
            res = await execute_db_query(query, [tenant_id])
            if res and res.get("rows"):
                icp = res["rows"][0]
        except Exception as e:
            icp = {
                "target_industries": ["Software", "SaaS", "Fintech"],
                "target_titles": ["VP of Sales", "CTO", "Head of Growth"],
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

    # 2. Query Raw Candidate Target Accounts (Apollo API Sourcing)
    sourcing_res = await search_apollo_accounts_impl(
        tenant_id=tenant_id,
        target_industries=target_industries,
        company_size_min=icp.get("company_size_min", 10),
        company_size_max=icp.get("company_size_max", 500),
        limit=5
    )

    accounts = sourcing_res.get("accounts", [])
    
    # If a specific target domain was requested in input, prioritize it
    if state.get("target_domain"):
        target_domain = state["target_domain"].replace("http://", "").replace("https://", "").strip("/")
        accounts = [{"company_name": target_domain.split(".")[0].title(), "domain": target_domain, "industry": target_industries[0]}] + accounts

    logs.append({
        "stage": "Stage 1: Business Understanding & Sourcing",
        "status": "COMPLETED",
        "details": f"Ingested ICP criteria. Discovered {len(accounts)} candidate accounts via Apollo API."
    })

    return {
        "icp_config": icp,
        "raw_accounts": accounts,
        "logs": logs,
    }
