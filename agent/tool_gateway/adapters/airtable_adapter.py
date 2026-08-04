"""
Airtable Adapter — translates tool requests to Airtable REST API using OAuth2 or Personal Access Tokens.
"""
from typing import Dict, Any
import httpx


async def execute_airtable_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    token = credentials.get("access_token") or credentials.get("api_key") or credentials.get("bearer_token")
    if not token:
        return "Error: Airtable OAuth Access Token or API Key is missing from tenant credentials."

    action = arguments.get("action") or tool_name
    base_id = arguments.get("base_id")
    table_name = arguments.get("table_name")

    if not base_id or not table_name:
        return "Error: Both 'base_id' and 'table_name' are required for Airtable operations."

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    url = f"https://api.airtable.com/v0/{base_id}/{table_name}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if action in ("airtable_search_records", "search_records", "airtable_get_records"):
                params = {}
                query_str = arguments.get("query")
                search_field = arguments.get("search_field", "Name")
                if query_str:
                    params["filterByFormula"] = f"SEARCH('{query_str}', {{{search_field}}})"
                
                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    records = res.json().get("records", [])
                    return f"Successfully retrieved {len(records)} record(s) from Airtable base '{base_id}' table '{table_name}': {records[:5]}"
                return f"Airtable API Error ({res.status_code}): {res.text}"

            elif action in ("airtable_create_record", "create_record"):
                fields = arguments.get("fields", {})
                if not fields:
                    return "Error: 'fields' object is required to create an Airtable record."
                payload = {"fields": fields}
                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    created = res.json()
                    return f"Successfully created record in Airtable with ID: {created.get('id')}"
                return f"Airtable API Error ({res.status_code}): {res.text}"

            elif action in ("airtable_get_record", "get_record"):
                record_id = arguments.get("record_id")
                if not record_id:
                    return "Error: 'record_id' is required to fetch a specific Airtable record."
                res = await client.get(f"{url}/{record_id}", headers=headers)
                if res.is_success:
                    return f"Airtable Record ({record_id}): {res.json()}"
                return f"Airtable API Error ({res.status_code}): {res.text}"

            else:
                # Default to listing records if no specific action matched
                res = await client.get(url, headers=headers)
                if res.is_success:
                    records = res.json().get("records", [])
                    return f"Airtable Base '{base_id}' Table '{table_name}' Records: {records[:5]}"
                return f"Airtable API Error ({res.status_code}): {res.text}"
    except Exception as e:
        return f"Airtable execution exception: {str(e)}"
