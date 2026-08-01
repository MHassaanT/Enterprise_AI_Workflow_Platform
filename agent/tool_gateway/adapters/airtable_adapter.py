"""
Airtable Adapter — translates tool requests to Airtable REST API.
"""
from typing import Dict, Any
import httpx


async def execute_airtable_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    api_key = credentials.get("api_key") or credentials.get("access_token") or credentials.get("bearer_token")
    if not api_key:
        return "Error: Airtable API Key or Access Token is missing from tenant credentials."

    base_id = arguments.get("base_id")
    table_name = arguments.get("table_name")

    if not base_id or not table_name:
        return "Error: Both 'base_id' and 'table_name' are required for Airtable operation."

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    url = f"https://api.airtable.com/v0/{base_id}/{table_name}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if tool_name == "airtable_search_records":
                params = {}
                if arguments.get("query"):
                    params["filterByFormula"] = f"SEARCH('{arguments.get('query')}', {arguments.get('search_field', 'Name')})"
                
                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    records = res.json().get("records", [])
                    return f"Successfully retrieved {len(records)} record(s) from Airtable: {records[:5]}"
                return f"Airtable API Error ({res.status_code}): {res.text}"

            elif tool_name == "airtable_create_record":
                fields = arguments.get("fields", {})
                payload = {"fields": fields}
                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    created = res.json()
                    return f"Successfully created record in Airtable with ID: {created.get('id')}"
                return f"Airtable API Error ({res.status_code}): {res.text}"

            else:
                return f"Error: Unknown Airtable tool '{tool_name}'."
    except Exception as e:
        return f"Airtable execution exception: {str(e)}"
