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

mcp = FastMCP("Enterprise Customer Support Tools")


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
