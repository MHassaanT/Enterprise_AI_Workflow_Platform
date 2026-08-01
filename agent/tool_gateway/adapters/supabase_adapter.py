"""
Supabase Adapter — translates tool requests to Supabase PostgREST REST API.
Injects decrypted Project URL and Service Role Key into outbound HTTP requests.
"""
from typing import Dict, Any
import httpx


async def execute_supabase_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    """
    Executes Supabase PostgREST queries using decrypted Project URL & Service Role Key.
    """
    project_url = credentials.get("project_url") or credentials.get("url")
    service_role_key = (
        credentials.get("service_role_key")
        or credentials.get("api_key")
        or credentials.get("secret_key")
    )

    if not project_url or not service_role_key:
        return "Error: Supabase 'project_url' and 'service_role_key' are required in tenant credentials."

    table_name = arguments.get("table") or arguments.get("table_name")
    if not table_name:
        return "Error: Table name ('table') is required for Supabase operation."

    base_url = project_url.rstrip("/")
    url = f"{base_url}/rest/v1/{table_name}"

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    action = arguments.get("action") or tool_name
    action_lower = action.lower()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Query / Select Records
            if "select" in action_lower or "query" in action_lower or "read" in action_lower or "get" in action_lower:
                params = arguments.get("query") or {}
                if "select" in arguments and "select" not in params:
                    params["select"] = arguments["select"]
                
                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    records = res.json()
                    return f"Successfully queried Supabase table '{table_name}': {records}"
                return f"Supabase API Error ({res.status_code}): {res.text}"

            # 2. Insert Row
            elif "insert" in action_lower or "create" in action_lower or "add" in action_lower:
                payload = arguments.get("payload") or arguments.get("data") or arguments.get("fields") or {}
                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    inserted = res.json()
                    return f"Successfully inserted row into Supabase table '{table_name}': {inserted}"
                return f"Supabase Insert Error ({res.status_code}): {res.text}"

            # 3. Update Row
            elif "update" in action_lower or "patch" in action_lower:
                payload = arguments.get("payload") or arguments.get("data") or {}
                params = arguments.get("query") or {}
                res = await client.patch(url, headers=headers, params=params, json=payload)
                if res.is_success:
                    updated = res.json()
                    return f"Successfully updated row in Supabase table '{table_name}': {updated}"
                return f"Supabase Update Error ({res.status_code}): {res.text}"

            # 4. Delete Row
            elif "delete" in action_lower or "remove" in action_lower:
                params = arguments.get("query") or {}
                res = await client.delete(url, headers=headers, params=params)
                if res.is_success:
                    deleted = res.json()
                    return f"Successfully deleted record from Supabase table '{table_name}': {deleted}"
                return f"Supabase Delete Error ({res.status_code}): {res.text}"

            # Fallback
            else:
                res = await client.get(url, headers=headers)
                if res.is_success:
                    return f"Supabase PostgREST Response: {res.json()}"
                return f"Supabase PostgREST Error ({res.status_code}): {res.text}"

    except Exception as e:
        return f"Supabase execution exception: {str(e)}"
