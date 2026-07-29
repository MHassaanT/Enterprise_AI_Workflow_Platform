"""
Tool: check_order_status

Phase 3: Mock data implementation — defines the contract.
Phase 4: Replace MOCK_ORDERS with a real Postgres query against the orders table.
"""
from pydantic import BaseModel

# ── Mock data — swap with DB query in Phase 4 ──
MOCK_ORDERS: dict[str, dict] = {
    "ORD-001": {"status": "Delivered", "date": "2026-07-25", "carrier": "FedEx"},
    "ORD-002": {"status": "Shipped", "eta": "2026-08-02", "carrier": "UPS"},
    "ORD-003": {"status": "Processing", "eta": "2026-08-05"},
    "ORD-004": {"status": "Cancelled", "reason": "Item out of stock"},
    "ORD-123": {"status": "Shipped", "eta": "2026-08-02", "carrier": "DHL", "tracking": "DHL123456789"},
    "ORD-456": {"status": "Delivered", "date": "2026-07-20", "carrier": "FedEx"},
}


class CheckOrderStatusInput(BaseModel):
    order_id: str


async def check_order_status_impl(order_id: str) -> str:
    order = MOCK_ORDERS.get(order_id.upper().strip())
    if not order:
        return (
            f"Order '{order_id}' was not found in our system. "
            "Please verify the order ID and try again."
        )

    parts = [f"Status: {order['status']}"]
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

    return f"Order {order_id} — " + " | ".join(parts)
