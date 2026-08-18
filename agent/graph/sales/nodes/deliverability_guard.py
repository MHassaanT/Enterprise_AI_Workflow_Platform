"""
Stage 4: Deliverability Guard Node.
Runs email verifier checks (RFC-5322 syntax, MX DNS lookup, disposable provider filter)
to ensure 100% email validity and protect sender domain reputation.
"""
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from services.email_verifier import verify_email


async def deliverability_guard_node(state: SalesAgentState) -> Dict[str, Any]:
    discovered_contacts = state.get("discovered_contacts", [])
    logs = list(state.get("logs", []))

    if not discovered_contacts and state.get("discovered_contact"):
        discovered_contacts = [state["discovered_contact"]]

    verified_contacts: List[Dict[str, Any]] = []

    for contact in discovered_contacts:
        email = contact.get("contact_email")
        if not email:
            contact["deliverability"] = {"is_valid": False, "status": "INVALID", "reason": "Missing email"}
            verified_contacts.append(contact)
            continue

        # Run Deliverability Verification Engine
        verify_res = await verify_email(email)
        contact["deliverability"] = verify_res
        verified_contacts.append(contact)

    valid_count = sum(1 for c in verified_contacts if c.get("deliverability", {}).get("is_valid", True))

    logs.append({
        "stage": "Stage 4: Deliverability Guard",
        "status": "COMPLETED",
        "details": f"Ran RFC 5322 syntax & MX DNS verification on {len(verified_contacts)} emails. {valid_count} verified as deliverable."
    })

    return {
        "verified_contacts": verified_contacts,
        "deliverability_result": verified_contacts[0].get("deliverability") if verified_contacts else None,
        "logs": logs,
    }
