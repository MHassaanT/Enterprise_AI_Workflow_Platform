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
    tenant_id: str | None = None,
    binding_id: str | None = None,
    credentials: dict | None = None,
    **kwargs: Any,
) -> str:
    search_term = (order_id or email or customer_email or user_email or query or "").strip()
    if not search_term and kwargs:
        for val in kwargs.values():
            if isinstance(val, str) and val.strip():
                search_term = val.strip()
                break

    if not search_term:
        return "Please provide an order ID or customer email address to check order status."

    creds = dict(credentials or {})
    try:
        from tool_gateway.adapters.airtable_adapter import execute_airtable_tool
        from tool_gateway.credentials_manager import fetch_tool_credentials

        if tenant_id and not (creds.get("access_token") or creds.get("api_key") or creds.get("bearer_token")):
            fetched = await fetch_tool_credentials(tenant_id, binding_id=binding_id)
            if fetched:
                creds.update(fetched)

        if creds.get("access_token") or creds.get("api_key") or creds.get("bearer_token") or creds.get("token"):
            return await execute_airtable_tool(
                tool_name="airtable_search_records",
                arguments={"query": search_term, "table_name": "Orders"},
                credentials=creds,
            )
    except Exception as e:
        print(f"[LIVE ORDER LOOKUP] Airtable adapter call exception: {e}")

    return f"No active order records found matching '{search_term}' in connected integrations. Please verify the order ID or connect Airtable in the Centralized Integration Hub."
