"""
Procurement Agent MCP Tools

Includes:
- create_purchase_order: Creates a PO in database and ERP system.
- record_vendor_bid: Logs incoming vendor bid in procurement_bids.
- send_po_to_vendor: Dispatches approved PO via Email MCP.
"""
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from services.db_client import execute_db_query

class CreatePOInput(BaseModel):
    vendor_name: str = Field(description="Name of the winning vendor.")
    vendor_email: str = Field(description="Email of vendor.")
    amount: float = Field(description="Total PO amount.")
    line_items: List[Dict[str, Any]] = Field(default=[], description="List of items.")
    tenant_id: str = Field(description="Tenant ID.")

class RecordBidInput(BaseModel):
    bid_reference: str = Field(description="Unique bid reference code.")
    vendor_name: str = Field(description="Vendor company name.")
    vendor_email: str = Field(description="Vendor email.")
    quote_amount: float = Field(description="Quoted price.")
    equipment_details: Dict[str, Any] = Field(default={}, description="Equipment specifications.")
    tenant_id: str = Field(description="Tenant ID.")


async def create_purchase_order_impl(
    vendor_name: str,
    vendor_email: str,
    amount: float,
    line_items: List[Dict[str, Any]],
    tenant_id: str,
) -> Dict[str, Any]:
    import random
    import json
    po_number = f"PO-2026-{random.randint(1000, 9999)}"
    query = """
    INSERT INTO purchase_orders (tenant_id, po_number, vendor_name, vendor_email, amount, line_items, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'APPROVED')
    RETURNING id, po_number;
    """
    res = await execute_db_query(query, [
        tenant_id, po_number, vendor_name, vendor_email, amount, json.dumps(line_items)
    ])
    po_id = res.get("rows", [{}])[0].get("id") if res and res.get("rows") else None
    return {
        "status": "success",
        "po_number": po_number,
        "po_id": po_id,
        "amount": amount,
        "vendor_name": vendor_name,
        "message": f"Purchase Order {po_number} created successfully."
    }


async def record_vendor_bid_impl(
    bid_reference: str,
    vendor_name: str,
    vendor_email: str,
    quote_amount: float,
    equipment_details: Dict[str, Any],
    tenant_id: str,
) -> Dict[str, Any]:
    import json
    query = """
    INSERT INTO procurement_bids (tenant_id, bid_reference, vendor_name, vendor_email, quote_amount, equipment_details)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (bid_reference) DO UPDATE SET quote_amount = EXCLUDED.quote_amount
    RETURNING id;
    """
    res = await execute_db_query(query, [
        tenant_id, bid_reference, vendor_name, vendor_email, quote_amount, json.dumps(equipment_details)
    ])
    return {
        "status": "success",
        "bid_reference": bid_reference,
        "bid_id": res.get("rows", [{}])[0].get("id") if res and res.get("rows") else None
    }
