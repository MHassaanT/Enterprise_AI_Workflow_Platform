"""
Airtable Adapter — translates tool requests to Airtable REST API using OAuth2 or Personal Access Tokens.
"""
from typing import Dict, Any
import httpx


async def execute_airtable_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    token = credentials.get("access_token") or credentials.get("api_key") or credentials.get("bearer_token") or credentials.get("token")
    if not token:
        return "Error: Airtable OAuth Access Token or API Key is missing from tenant credentials. Please configure Airtable in Centralized Integration Hub."

    action = (arguments.get("action") or tool_name).lower()
    base_id = arguments.get("base_id") or credentials.get("base_id") or credentials.get("default_base_id")
    table_name = arguments.get("table_name") or credentials.get("table_name") or credentials.get("default_table_name") or "Orders"

    if not base_id:
        return "Error: Both 'base_id' and 'table_name' are required for Airtable operations (specify in arguments or integration config)."

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    url = f"https://api.airtable.com/v0/{base_id}/{table_name}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. READ / SEARCH / GET RECORDS
            if any(k in action for k in ("search", "get", "check", "order", "list", "read", "find")):
                query_str = arguments.get("query") or arguments.get("order_id") or arguments.get("email") or arguments.get("customer_email") or ""
                params = {}
                if query_str:
                    search_field = arguments.get("search_field")
                    if search_field:
                        params["filterByFormula"] = f"SEARCH('{query_str}', {{{search_field}}})"
                    else:
                        # Real-time search across OrderId, CustomerEmail, CustomerName, Name, Email
                        params["filterByFormula"] = (
                            f"OR("
                            f"SEARCH('{query_str}', {{OrderId}}), "
                            f"SEARCH('{query_str}', {{CustomerEmail}}), "
                            f"SEARCH('{query_str}', {{CustomerName}}), "
                            f"SEARCH('{query_str}', {{Name}}), "
                            f"SEARCH('{query_str}', {{Email}})"
                            f")"
                        )

                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    records = res.json().get("records", [])
                    if not records:
                        return f"No matching records found in Airtable table '{table_name}' for '{query_str}'."
                    
                    formatted = [f"Record ID: {r.get('id')} | Fields: {r.get('fields')}" for r in records[:10]]
                    return f"Successfully retrieved {len(records)} record(s) from Airtable '{table_name}':\n" + "\n".join(formatted)
                
                return f"Airtable API Error ({res.status_code}): {res.text}"

            # 2. CREATE / WRITE RECORD
            elif any(k in action for k in ("create", "add", "write", "insert", "post")):
                fields = arguments.get("fields") or {}
                if not fields and isinstance(arguments, dict):
                    fields = {k: v for k, v in arguments.items() if k not in ("action", "base_id", "table_name")}

                if not fields:
                    return "Error: 'fields' object is required to create an Airtable record."

                payload = {"fields": fields}
                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    created = res.json()
                    return f"Successfully created record in Airtable! Record ID: {created.get('id')} | Fields: {created.get('fields')}"
                return f"Airtable API Error ({res.status_code}): {res.text}"

            # 3. UPDATE / EDIT RECORD
            elif any(k in action for k in ("update", "edit", "patch", "modify")):
                record_id = arguments.get("record_id")
                fields = arguments.get("fields") or {}
                if not record_id or not fields:
                    return "Error: Both 'record_id' and 'fields' are required to update an Airtable record."

                payload = {"fields": fields}
                res = await client.patch(f"{url}/{record_id}", headers=headers, json=payload)
                if res.is_success:
                    updated = res.json()
                    return f"Successfully updated record {record_id} in Airtable! Fields: {updated.get('fields')}"
                return f"Airtable API Error ({res.status_code}): {res.text}"

            else:
                # Default listing fallback
                res = await client.get(url, headers=headers)
                if res.is_success:
                    records = res.json().get("records", [])
                    formatted = [f"Record ID: {r.get('id')} | Fields: {r.get('fields')}" for r in records[:5]]
                    return f"Airtable Table '{table_name}' Records:\n" + "\n".join(formatted)
                return f"Airtable API Error ({res.status_code}): {res.text}"

    except Exception as e:
        return f"Airtable execution exception: {str(e)}"
