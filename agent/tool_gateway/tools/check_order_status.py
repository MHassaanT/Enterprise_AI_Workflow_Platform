"""
Tool: check_order_status

Phase 3: Mock data implementation — defines the contract.
Phase 4: Replace MOCK_ORDERS with a real Postgres query against the orders table.
"""
from typing import Any
from pydantic import BaseModel

# ── Mock data — swap with DB query in Phase 4 ──
MOCK_ORDERS: dict[str, dict] = {
    "ORD-001": {"email": "misterhassan58@gmail.com", "status": "Delivered", "date": "2026-07-25", "carrier": "FedEx"},
    "ORD-002": {"email": "customer@example.com", "status": "Shipped", "eta": "2026-08-02", "carrier": "UPS"},
    "ORD-003": {"email": "misterhassan58@gmail.com", "status": "Processing", "eta": "2026-08-05"},
    "ORD-004": {"status": "Cancelled", "reason": "Item out of stock"},
    "ORD-123": {"status": "Shipped", "eta": "2026-08-02", "carrier": "DHL", "tracking": "DHL123456789"},
    "ORD-456": {"status": "Delivered", "date": "2026-07-20", "carrier": "FedEx"},
}


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

    # Direct match on Order ID
    order = MOCK_ORDERS.get(search_term.upper())
    matched_id = search_term.upper()

    # Email search match
    if not order and "@" in search_term:
        for oid, data in MOCK_ORDERS.items():
            if data.get("email", "").lower() == search_term.lower():
                order = data
                matched_id = oid
                break

    if not order:
        return (
            f"No active orders found matching '{search_term}'. "
            "Please verify the order ID or email address and try again."
        )

    parts = [f"Status: {order['status']}"]
    if "email" in order:
        parts.append(f"Customer: {order['email']}")
    if "date" in order:
        parts.append(f"Delivered on: {order['date']}")
    if "eta" in order:
        parts.append(f"Estimated delivery: {order['eta']}")
    if "carrier" in order:
        parts.append(f"Carrier: {order['carrier']}")
    if "tracking" in order:
        parts.append(f"Tracking number: {order['tracking']}")
    if "reason" in order:
        parts.append(f"Reason: {order['reason']}")

    return f"Order {matched_id} — " + " | ".join(parts)
