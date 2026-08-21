"""
DB client — thin HTTP wrappers for Node.js internal routes.
The agent service never touches Postgres directly; all writes go through
the Node.js backend to keep tenant isolation logic in one place.
"""
import httpx
from config import settings

_HEADERS = lambda: {"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN}


async def get_agent_tool_bindings(agent_instance_id: str) -> dict:
    """
    Fetches authorized tool bindings & MCP configs for the given agent instance.
    Returns: {"tools": [...], "is_default_fallback": bool}
    """
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
            ],
            "is_default_fallback": True,
        }

async def get_tenant_tool_bindings(tenant_id: str) -> dict:
    """
    Fetches all authorized tools for a tenant, bypassing agent-specific bindings.
    """
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
            ],
            "is_default_fallback": True,
        }


async def create_approval_request(payload: dict) -> str:
    """
    Creates a pending ApprovalRequest record in Postgres.
    Returns the new approval UUID.
    """
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
    """
    Appends an entry to the audit_logs table.
    Fire-and-forget — errors are logged but do not interrupt the agent flow.
    """
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
    """
    Executes a SQL query via the internal Node.js backend route /internal/db/query.
    Returns {"rows": [...], "rowCount": int}
    """
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
    """
    Fetches tenant company details & sender metadata for agent email context.
    Returns: {"company_name", "description", "website", "industry", "sender_name", "sender_role", "sender_email"}
    """
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


