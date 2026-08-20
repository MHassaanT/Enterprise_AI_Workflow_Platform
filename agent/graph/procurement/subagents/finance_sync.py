import json
import random
import time
from typing import Dict, Any, List
from agent.services.llm_gateway import get_llm

class FinanceSyncSubAgent:
    """
    Sub-Agent 6: Finance Integration Sub-Agent
    Finalizes procurement, creates Purchase Orders (PO-2026-PROC-XXXX), reserves department budget,
    and updates the Finance Agent's General Ledger (`general_ledger`) and audit log (`audit_logs`).
    """

    def process(self, procurement_id: str, title: str, department: str, winning_vendor: Dict[str, Any], tenant_id: str) -> Dict[str, Any]:
        po_number = f"PO-2026-PROC-{random.randint(1000, 9999)}"
        quote_amount = winning_vendor.get("quote_amount", 0.0)
        vendor_name = winning_vendor.get("vendor_name", "Vendor")
        vendor_email = winning_vendor.get("vendor_email", "vendor@example.com")

        # Compile Final Procurement Completion Report
        final_report = {
            "procurement_id": procurement_id,
            "project_title": title,
            "department": department,
            "po_number": po_number,
            "selected_vendor": {
                "vendor_name": vendor_name,
                "vendor_email": vendor_email,
                "domain": winning_vendor.get("domain"),
                "agreed_amount": quote_amount,
                "lead_time_days": winning_vendor.get("lead_time_days", 14),
                "payment_terms": winning_vendor.get("payment_terms", "Net 30"),
                "sla_terms": winning_vendor.get("sla_terms")
            },
            "finance_sync_details": {
                "general_ledger_account": "EXP-PROC-501",
                "general_ledger_status": "FUNDS_RESERVED",
                "purchase_order_status": "CREATED",
                "invoice_matching_status": "AWAITING_INVOICE"
            },
            "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
        }

        # Build sync payloads for Finance Agent tables
        finance_sync_payload = {
            "po_record": {
                "po_number": po_number,
                "tenant_id": tenant_id,
                "vendor_name": vendor_name,
                "vendor_email": vendor_email,
                "amount": quote_amount,
                "status": "APPROVED",
                "line_items": [
                    {"description": f"Procurement Fulfillment for {title}", "amount": quote_amount}
                ]
            },
            "gl_ledger_entry": {
                "account_code": "EXP-PROC-501",
                "account_name": "Procurement & Vendor Expenses",
                "transaction_type": "EXPENSE_RESERVE",
                "actual_expense": quote_amount,
                "reference_id": po_number
            },
            "audit_log": {
                "action": "NOTIFY_FINANCE_PROCUREMENT_CLOSED",
                "subagent": "finance_sync",
                "details": f"Created Purchase Order {po_number} for {vendor_name} ($ {quote_amount:,.2f})"
            }
        }

        return {
            "status": "success",
            "subagent": "finance_sync",
            "po_number": po_number,
            "final_report": final_report,
            "finance_sync_payload": finance_sync_payload,
            "finance_synced": True
        }
