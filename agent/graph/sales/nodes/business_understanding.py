"""
Stage 1: Business Understanding & Lead Sourcing Node.
Ingests ICP parameters, competitor battlecards, and queries candidate accounts via Hunter.io API.
"""
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from tool_gateway.hunter_mcp import search_hunter_accounts_impl
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

    # 2. Fetch Existing Prospects for Tenant to Enforce Cross-Campaign Uniqueness (only sent emails/outreach)
    existing_domains = set(state.get("existing_domains") or [])
    existing_emails = set(state.get("existing_emails") or [])
    try:
        ex_query = "SELECT LOWER(domain) as domain, LOWER(contact_email) as contact_email FROM sales_prospects WHERE outreach_sent = true AND (tenant_id = $1 OR tenant_id = '00000000-0000-0000-0000-000000000000');"
        ex_res = await execute_db_query(ex_query, [tenant_id])
        if ex_res and ex_res.get("rows"):
            for row in ex_res["rows"]:
                if row.get("domain"):
                    existing_domains.add(row["domain"].strip().lower())
                if row.get("contact_email"):
                    existing_emails.add(row["contact_email"].strip().lower())
    except Exception as e:
        pass

    # 3. Query Candidate Target Accounts (Hunter.io API Sourcing with Domain Exclusion)
    fetch_limit = max(prospect_limit * 4, 40)
    sourcing_res = await search_hunter_accounts_impl(
        tenant_id=tenant_id,
        target_industries=target_industries,
        company_size_min=icp.get("company_size_min", 10),
        company_size_max=icp.get("company_size_max", 500),
        limit=fetch_limit,
        exclude_domains=list(existing_domains)
    )

    raw_accounts: List[Dict[str, Any]] = sourcing_res.get("accounts", [])
    
    # Filter out any accounts matching existing domains where outreach was already sent
    accounts = [acc for acc in raw_accounts if acc.get("domain", "").lower() not in existing_domains]
    if not accounts:
        accounts = raw_accounts
    
    # Prioritize specific target domain if provided
    if state.get("target_domain"):
        target_domain = state["target_domain"].replace("http://", "").replace("https://", "").strip("/")
        accounts = [{"company_name": target_domain.split(".")[0].title(), "domain": target_domain, "industry": target_industries[0]}] + accounts

    logs.append({
        "stage": "Stage 1: Business Understanding & Sourcing",
        "status": "COMPLETED",
        "details": f"Ingested ICP criteria. Retrieved {len(existing_domains)} previously targeted domains to enforce uniqueness. Sourced {len(accounts)} fresh candidate target accounts (Target valid prospects: {prospect_limit})."
    })

    return {
        "tenant_id": tenant_id,
        "icp_config": icp,
        "raw_accounts": accounts,
        "existing_domains": list(existing_domains),
        "existing_emails": list(existing_emails),
        "logs": logs,
    }
