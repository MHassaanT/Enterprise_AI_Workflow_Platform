"""
FastMCP Server — exposes tools via Streamable HTTP transport.

Mounted into the main FastAPI app at /mcp.
The lifespan is passed to FastAPI for proper session management.

Note: Tools are registered here for the MCP protocol surface (external clients).
     The agent's tool_executor uses TOOL_REGISTRY directly (in-process, faster).
"""
from fastmcp import FastMCP
from tool_gateway.tools.check_order_status import check_order_status_impl
from tool_gateway.tools.escalate_to_human import escalate_to_human_impl

from tool_gateway.apollo_mcp import search_apollo_accounts_impl
from tool_gateway.search_discovery import search_contact_person
from services.email_verifier import verify_email

mcp = FastMCP("Enterprise Workflow Tools")


@mcp.tool()
async def check_order_status(order_id: str) -> str:
    """
    Returns the current status of a customer order.
    Use when the user asks about their order, delivery, shipment, or tracking.
    """
    return await check_order_status_impl(order_id=order_id)


@mcp.tool()
async def escalate_to_human(reason: str, action_payload: str = "") -> str:
    """
    Escalates a customer issue to a human agent or supervisor.
    Use when you cannot resolve the issue or when a refund/credit/sensitive action is requested.
    """
    payload = {"details": action_payload} if action_payload else None
    return await escalate_to_human_impl(reason=reason, action_payload=payload)


@mcp.tool()
async def apollo_search_accounts(tenant_id: str, target_industries: str = "", limit: int = 5) -> str:
    """Queries candidate target accounts using Apollo API filters without burning verification credits."""
    industries = [i.strip() for i in target_industries.split(",") if i.strip()]
    res = await search_apollo_accounts_impl(tenant_id, industries, limit=limit)
    return str(res)


@mcp.tool()
async def apollo_find_contacts(tenant_id: str, domain: str, target_titles: str = "") -> str:
    """Finds decision-maker contacts for a target domain using Serper search + pattern inference."""
    titles = [t.strip() for t in target_titles.split(",") if t.strip()]
    res = await search_contact_person(tenant_id, domain.split(".")[0].title(), domain, titles)
    return str(res)


@mcp.tool()
async def verify_email_deliverability(email: str) -> str:
    """Verifies email deliverability using RFC-5322 syntax, MX DNS lookup, and disposable domain filters."""
    res = await verify_email(email)
    return str(res)



