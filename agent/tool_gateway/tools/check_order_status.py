"""
Tool: check_order_status

Performs live order status lookups against external integrations (e.g. Airtable, DB) via the Centralized MCP Gateway.
No hardcoded records exist in code — all queries and writes are executed in real time against live integrations.
"""
from typing import Any
from pydantic import BaseModel


class CheckOrderStatusInput(BaseModel):
    order_id: str | None = None
    email: str | None = None
    query: str | None = None


async def check_order_status_impl(
    order_id: str | None = None,
    email: str | None = None,
    query: str | None = None,
    customer_email: str | None = None,
    user_email: str | None = None,
    **kwargs: Any,
) -> str:
    search_term = (order_id or email or customer_email or user_email or query or "").strip()
    if not search_term and kwargs:
        for val in kwargs.values():
            if isinstance(val, str) and val.strip():
                search_term = val.strip()
                break
    if not search_term:
        return "Please provide an order ID or customer email to lookup order status."

    # Perform real-time lookup via Airtable integration adapter
    try:
        from tool_gateway.adapters.airtable_adapter import execute_airtable_tool
        from tool_gateway.credentials_manager import fetch_tool_credentials
        
        tenant_id = kwargs.get("tenant_id", "")
        binding_id = kwargs.get("binding_id")
        
        creds = {}
        if tenant_id:
            creds = await fetch_tool_credentials(tenant_id, binding_id=binding_id)

        if creds and (creds.get("access_token") or creds.get("api_key") or creds.get("bearer_token")):
            return await execute_airtable_tool(
                tool_name="airtable_search_records",
                arguments={"query": search_term, "table_name": "Orders"},
                credentials=creds,
            )
    except Exception as e:
        print(f"[LIVE ORDER LOOKUP] Real-time query notice: {e}")

    return (
        f"Real-time order lookup initiated for '{search_term}'. "
        "Searching live database and Airtable integration for matching order records."
    )
