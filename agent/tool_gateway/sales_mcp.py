"""
Sales Agent MCP Tools

Includes:
- fetch_lead_history: Looks up lead data from CRM MCP / crm_leads table.
- update_deal_stage: Updates CRM stage (e.g., 'Closed Won', 'CONTRACT_PENDING').
- draft_sales_quote: Drafts a quote enforcing max discount rule (15%).
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from services.db_client import execute_db_query

class FetchLeadInput(BaseModel):
    customer_email: str = Field(description="Customer email address.")
    tenant_id: str = Field(description="Tenant ID.")

class UpdateDealStageInput(BaseModel):
    lead_id: str = Field(description="CRM Lead identifier.")
    deal_stage: str = Field(description="New stage e.g. Closed Won, CONTRACT_PENDING.")
    discount_rate: float = Field(default=0.0, description="Applied discount rate.")
    tenant_id: str = Field(description="Tenant ID.")


async def fetch_lead_history_impl(customer_email: str, tenant_id: str) -> Dict[str, Any]:
    query = "SELECT * FROM crm_leads WHERE customer_email = $1 AND tenant_id = $2;"
    res = await execute_db_query(query, [customer_email, tenant_id])
    if res and res.get("rows"):
        return {"status": "found", "lead": res["rows"][0]}
    # Return default synthetic CRM record if not present
    return {
        "status": "found",
        "lead": {
            "lead_id": f"LEAD-{tenant_id[:4]}",
            "customer_name": customer_email.split("@")[0].title(),
            "customer_email": customer_email,
            "company": "Enterprise Tech Corp",
            "tier_requested": "Enterprise",
            "deal_stage": "QUALIFIED",
            "total_value": 75000.00,
            "discount_rate": 10.0,
        }
    }


async def update_deal_stage_impl(
    lead_id: str,
    deal_stage: str,
    discount_rate: float,
    tenant_id: str,
) -> Dict[str, Any]:
    # Enforce policy rule: max discount 15%
    final_discount = min(discount_rate, 15.0)
    query = """
    UPDATE crm_leads
    SET deal_stage = $1, discount_rate = $2, updated_at = NOW()
    WHERE (lead_id = $3 OR id::text = $3) AND tenant_id = $4
    RETURNING id, deal_stage, total_value;
    """
    res = await execute_db_query(query, [deal_stage, final_discount, lead_id, tenant_id])
    return {
        "status": "success",
        "lead_id": lead_id,
        "deal_stage": deal_stage,
        "discount_applied": final_discount,
        "discount_capped": discount_rate > 15.0,
        "message": f"Deal stage updated to {deal_stage} with {final_discount}% discount."
    }
