import httpx
from config import settings

_HEADERS = lambda: {"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN}


async def get_agent_tool_bindings(agent_instance_id: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.BACKEND_URL}/internal/agents/{agent_instance_id}/tools",
                headers=_HEADERS(),
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        print(f"[TOOL BINDINGS ERROR] Failed to fetch tools for agent {agent_instance_id}: {e}")
        return {
            "tools": [
                {"tool_name": "check_order_status", "connector_type": "builtin", "is_high_risk": False},
                {"tool_name": "escalate_to_human", "connector_type": "builtin", "is_high_risk": True},
                {"tool_name": "authenticate_user_with_email", "connector_type": "builtin", "is_high_risk": False},
            ],
            "is_default_fallback": True,
        }

async def get_tenant_tool_bindings(tenant_id: str) -> dict:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.BACKEND_URL}/internal/tenants/{tenant_id}/tools",
                headers=_HEADERS(),
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        print(f"[TOOL BINDINGS ERROR] Failed to fetch tools for tenant {tenant_id}: {e}")
        return {
            "tools": [
                {"tool_name": "check_order_status", "connector_type": "builtin", "is_high_risk": False},
                {"tool_name": "escalate_to_human", "connector_type": "builtin", "is_high_risk": True},
                {"tool_name": "authenticate_user_with_email", "connector_type": "builtin", "is_high_risk": False},
            ],
            "is_default_fallback": True,
        }


async def create_approval_request(payload: dict) -> str:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.BACKEND_URL}/internal/approvals",
                json=payload,
                headers=_HEADERS(),
            )
            response.raise_for_status()
            return response.json()["approvalId"]
    except Exception as e:
        print(f"[APPROVAL REQ ERROR] Failed to create approval request at {settings.BACKEND_URL}/internal/approvals: {e}")
        raise e


async def write_audit_log(tenant_id: str, event_type: str, payload: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{settings.BACKEND_URL}/internal/audit",
                json={"tenantId": tenant_id, "eventType": event_type, "payload": payload},
                headers=_HEADERS(),
            )
    except Exception as e:
        print(f"[AUDIT LOG] Failed to write audit log: {e}")


async def execute_db_query(sql: str, params: list = None, tenant_id: str = None) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{settings.BACKEND_URL}/internal/db/query",
                json={
                    "sql": sql,
                    "params": params or [],
                    "tenantId": tenant_id
                },
                headers=_HEADERS(),
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        print(f"[DB QUERY ERROR] Failed to execute DB query via backend: {e}")
        return {"rows": [], "rowCount": 0, "error": str(e)}


async def get_tenant_company_context(tenant_id: str) -> dict:
    if not tenant_id:
        return {
            "company_name": "Enterprise Client",
            "description": "",
            "website": "",
            "industry": "",
            "sender_name": "Team Representative",
            "sender_role": "Representative",
            "sender_email": ""
        }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.BACKEND_URL}/internal/tenants/{tenant_id}/company-context",
                headers=_HEADERS(),
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        print(f"[COMPANY CONTEXT ERROR] Failed to fetch company context for tenant {tenant_id}: {e}")
        return {
            "company_name": "Enterprise Client",
            "description": "",
            "website": "",
            "industry": "",
            "sender_name": "Team Representative",
            "sender_role": "Representative",
            "sender_email": ""
        }


async def create_reported_issue(payload: dict) -> str:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{settings.BACKEND_URL}/internal/reported-issues",
                json=payload,
                headers=_HEADERS(),
            )
            response.raise_for_status()
            return response.json()["issueId"]
    except Exception as e:
        print(f"[REPORTED ISSUE ERROR] Failed to create reported issue: {e}")
        raise e


async def get_pending_issues(tenant_id: str) -> list:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.BACKEND_URL}/internal/reported-issues/pending",
                params={"tenantId": tenant_id},
                headers=_HEADERS(),
            )
            response.raise_for_status()
            return response.json().get("issues", [])
    except Exception as e:
        print(f"[REPORTED ISSUE ERROR] Failed to fetch pending issues: {e}")
        return []


async def update_issue_investigation(issue_id: str, payload: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.patch(
                f"{settings.BACKEND_URL}/internal/reported-issues/{issue_id}/investigation",
                json=payload,
                headers=_HEADERS(),
            )
            response.raise_for_status()
    except Exception as e:
        print(f"[REPORTED ISSUE ERROR] Failed to update issue investigation: {e}")
        raise e


async def book_ride(tenant_id: str, ride_details: dict) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{settings.BACKEND_URL}/internal/rides/book",
                json={"tenantId": tenant_id, "rideDetails": ride_details},
                headers=_HEADERS(),
            )
            response.raise_for_status()
            return response.json()
    except Exception as e:
        print(f"[RIDE BOOKING ERROR] Failed to book ride: {e}")
        return {"error": str(e)}