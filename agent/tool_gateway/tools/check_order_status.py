"""
Tool: check_order_status

Phase 3: Mock data implementation — defines the contract.
Phase 4: Replace MOCK_ORDERS with a real Postgres query against the orders table.
"""
from typing import Any
from pydantic import BaseModel

# ── Mock data — syncs with Airtable dataset ──
MOCK_ORDERS: dict[str, dict] = {
    "ORD-1001": {"name": "Alice Johnson", "email": "alice.johnson@example.com", "status": "Delivered", "date": "2026-07-21", "carrier": "FedEx"},
    "ORD-1002": {"name": "Bob Smith", "email": "bob.smith@example.com", "status": "Processing", "eta": "2026-08-02", "carrier": "UPS"},
    "ORD-1003": {"name": "Carol Lee", "email": "carol.lee@example.com", "status": "Shipped", "eta": "2026-08-03", "carrier": "DHL"},
    "ORD-1004": {"name": "David Kim", "email": "david.kim@example.com", "status": "Delivered", "date": "2026-07-24", "carrier": "USPS"},
    "ORD-1005": {"name": "Hassan Tahir", "email": "misterhassan58@gmail.com", "alt_email": "hassan.tahir.yes@gmail.com", "status": "Delivered", "date": "2026-07-25", "carrier": "FedEx"},
    "ORD-1006": {"name": "Frank Moore", "email": "frank.moore@example.com", "status": "Pending", "eta": "2026-08-06"},
    "ORD-1007": {"name": "Grace Hall", "email": "grace.hall@example.com", "status": "Processing", "eta": "2026-08-07"},
    "ORD-1008": {"name": "Henry Young", "email": "henry.young@example.com", "status": "Shipped", "eta": "2026-08-08", "carrier": "FedEx"},
    "ORD-1009": {"name": "Ivy Scott", "email": "ivy.scott@example.com", "status": "Delivered", "date": "2026-07-29", "carrier": "UPS"},
    "ORD-1010": {"name": "Jack White", "email": "jack.white@example.com", "status": "Refunded", "date": "2026-07-30"},
    # Fallback legacy aliases
    "ORD-001": {"name": "Hassan Tahir", "email": "misterhassan58@gmail.com", "status": "Delivered", "date": "2026-07-25", "carrier": "FedEx"},
    "ORD-002": {"name": "Bob Smith", "email": "customer@example.com", "status": "Shipped", "eta": "2026-08-02", "carrier": "UPS"},
    "ORD-003": {"name": "Hassan Tahir", "email": "misterhassan58@gmail.com", "status": "Processing", "eta": "2026-08-05"},
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

    # Email / Name search match
    if not order:
        term_lower = search_term.lower()
        for oid, data in MOCK_ORDERS.items():
            e1 = data.get("email", "").lower()
            e2 = data.get("alt_email", "").lower()
            name = data.get("name", "").lower()
            if term_lower in (e1, e2) or (len(term_lower) > 3 and term_lower in e1) or (len(term_lower) > 3 and term_lower in name):
                order = data
                matched_id = oid
                break

    if not order:
        return (
            f"No active orders found matching '{search_term}'. "
            "Please verify the order ID or email address and try again."
        )

    parts = [f"Status: {order['status']}"]
    if "name" in order:
        parts.append(f"Customer Name: {order['name']}")
    if "email" in order:
        parts.append(f"Customer Email: {order['email']}")
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
