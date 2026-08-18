"""
Stage 4: Deliverability Guard Node.
Runs email verifier checks (RFC-5322 syntax, MX DNS lookup, disposable provider filter)
to ensure 100% email validity and protect sender domain reputation.
"""
from typing import Dict, Any
from graph.sales.state import SalesAgentState
from services.email_verifier import verify_email


async def deliverability_guard_node(state: SalesAgentState) -> Dict[str, Any]:
    contact = state.get("discovered_contact")
    logs = list(state.get("logs", []))

    if not contact or not contact.get("contact_email"):
        logs.append({
            "stage": "Stage 4: Deliverability Guard",
            "status": "FAILED",
            "details": "No contact email address available for verification."
        })
        return {
            "deliverability_result": {"is_valid": False, "status": "INVALID", "reason": "Missing email address."},
            "logs": logs
        }

    email = contact["contact_email"]
    
    # Run Deliverability Verification Engine
    verify_res = await verify_email(email)

    logs.append({
        "stage": "Stage 4: Deliverability Guard",
        "status": "COMPLETED",
        "details": f"Email '{email}' verified: Status={verify_res.get('status')}, Deliverability={verify_res.get('deliverability')}, MX={verify_res.get('has_mx_records')}."
    })

    return {
        "deliverability_result": verify_res,
        "logs": logs,
    }
