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

from tool_gateway.finance_mcp import execute_payment_impl, fetch_po_details_impl, update_general_ledger_impl, query_department_budget_impl
from tool_gateway.procurement_mcp import create_purchase_order_impl, record_vendor_bid_impl
from tool_gateway.sales_mcp import fetch_lead_history_impl, update_deal_stage_impl

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
async def execute_payment(invoice_number: str, po_number: str, amount: float, vendor_email: str, tenant_id: str) -> str:
    """Executes vendor payment via ERP system and updates general ledger."""
    res = await execute_payment_impl(invoice_number, po_number, amount, vendor_email, tenant_id)
    return str(res)


@mcp.tool()
async def create_purchase_order(vendor_name: str, vendor_email: str, amount: float, tenant_id: str) -> str:
    """Creates a Purchase Order (PO) in ERP system."""
    res = await create_purchase_order_impl(vendor_name, vendor_email, amount, [], tenant_id)
    return str(res)


@mcp.tool()
async def update_deal_stage(lead_id: str, deal_stage: str, discount_rate: float, tenant_id: str) -> str:
    """Updates CRM lead stage and applies discount (capped at 15%)."""
    res = await update_deal_stage_impl(lead_id, deal_stage, discount_rate, tenant_id)
    return str(res)

