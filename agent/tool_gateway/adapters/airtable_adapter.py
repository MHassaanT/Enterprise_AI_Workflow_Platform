"""
Airtable Adapter — translates tool requests to Airtable REST API using OAuth2 or Personal Access Tokens.
"""
from typing import Dict, Any
import httpx


async def _auto_discover_base_id(token: str) -> str | None:
    """
    Fallback: if credentials have an access_token but no base_id (legacy OAuth flow),
    call the Airtable Meta API to discover the first authorized base at runtime.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                "https://api.airtable.com/v0/meta/bases",
                headers={"Authorization": f"Bearer {token}"},
            )
            if res.is_success:
                bases = res.json().get("bases", [])
                if bases:
                    base_id = bases[0]["id"]
                    print(f"[AIRTABLE ADAPTER] Auto-discovered base_id={base_id} from Meta API ({len(bases)} base(s) available)")
                    return base_id
                else:
                    print("[AIRTABLE ADAPTER] Meta API returned 0 bases — check OAuth scope includes schema.bases:read")
            else:
                print(f"[AIRTABLE ADAPTER] Meta API returned {res.status_code}: {res.text[:200]}")
    except Exception as e:
        print(f"[AIRTABLE ADAPTER] Meta API auto-discovery failed: {e}")
    return None


async def _get_table_fields(base_id: str, table_name: str, token: str) -> list:
    """
    Fallback: fetch actual field names for table_name from Meta API so formula search uses existing columns.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"https://api.airtable.com/v0/meta/bases/{base_id}/tables",
                headers={"Authorization": f"Bearer {token}"},
            )
            if res.is_success:
                tables = res.json().get("tables", [])
                for t in tables:
                    if t.get("name", "").lower() == table_name.lower():
                        return [f.get("name") for f in t.get("fields", []) if f.get("name")]
    except Exception as e:
        print(f"[AIRTABLE ADAPTER] Meta API table schema fetch error: {e}")
    return []


async def execute_airtable_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    token = credentials.get("access_token") or credentials.get("api_key") or credentials.get("bearer_token") or credentials.get("token")
    if not token:
        print("[AIRTABLE ADAPTER] No token found in credentials — integration not connected")
        return "I cannot fetch the data because the Airtable integration has not been connected yet. Please inform the user that the administrator needs to connect Airtable in the Centralized Integration Hub."

    action = (arguments.get("action") or tool_name).lower()
    base_id = arguments.get("base_id") or credentials.get("base_id") or credentials.get("default_base_id")
    table_name = arguments.get("table_name") or credentials.get("table_name") or credentials.get("default_table_name") or "Orders"

    # Self-healing: Ignore dummy placeholders or hallucinated UUIDs from the UI or LLM
    if base_id and not base_id.startswith("app"):
        print(f"[AIRTABLE ADAPTER] Ignoring invalid/dummy base_id '{base_id}' (must start with 'app')")
        base_id = None
        
    if table_name and ("your" in table_name.lower() or "dummy" in table_name.lower() or "placeholder" in table_name.lower()):
        print(f"[AIRTABLE ADAPTER] Ignoring dummy table_name '{table_name}'")
        table_name = "Orders"

    # Self-healing: auto-discover base_id from Meta API if missing from credentials
    if not base_id:
        print("[AIRTABLE ADAPTER] base_id missing from credentials — attempting auto-discovery via Meta API")
        base_id = await _auto_discover_base_id(token)

    if not base_id:
        print("[AIRTABLE ADAPTER] base_id still missing after auto-discovery — cannot proceed")
        return "I cannot fetch the data because the Airtable Base ID is missing. Please inform the user that the administrator needs to configure the Base ID in the integration setup."

    print(f"[AIRTABLE ADAPTER] Executing action='{action}' | base_id={base_id} | table={table_name}")

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
                query_lower = query_str.lower().strip()

                is_generic_query = (
                    not query_lower or
                    query_lower in (
                        "fetch_record_details", "fetch_all", "get_records", "read", "list", "all",
                        "fetch the record's details", "fetch record details", "check_order_status"
                    ) or
                    query_lower.startswith("fetch_") or
                    query_lower.startswith("get_")
                )

                records = []
                # Attempt filtered search first, then fall back to unfiltered fetch
                if query_str and not is_generic_query:
                    search_field = arguments.get("search_field")
                    if search_field:
                        formula = f"SEARCH('{query_str}', {{{search_field}}})"
                    else:
                        table_fields = await _get_table_fields(base_id, table_name, token)
                        if table_fields:
                            search_clauses = [f"SEARCH('{query_str}', {{{f}}})" for f in table_fields[:10]]
                            formula = f"OR({', '.join(search_clauses)})"
                        else:
                            formula = (
                                f"OR("
                                f"SEARCH('{query_str}', {{OrderId}}), "
                                f"SEARCH('{query_str}', {{CustomerEmail}}), "
                                f"SEARCH('{query_str}', {{CustomerName}}), "
                                f"SEARCH('{query_str}', {{Name}}), "
                                f"SEARCH('{query_str}', {{Email}})"
                                f")"
                            )

                    res = await client.get(url, headers=headers, params={"filterByFormula": formula})
                    print(f"[AIRTABLE ADAPTER] Filtered search response: status={res.status_code} body={res.text[:300]}")

                    if res.is_success:
                        records = res.json().get("records", [])
                    elif res.status_code == 422:
                        # Formula error — field names likely don't match the table schema.
                        # Fall back to fetching all records and searching client-side.
                        print(f"[AIRTABLE ADAPTER] Formula rejected (422) — falling back to unfiltered fetch + client-side search")
                        fallback_res = await client.get(url, headers=headers)
                        print(f"[AIRTABLE ADAPTER] Unfiltered fetch response: status={fallback_res.status_code}")
                        if fallback_res.is_success:
                            all_records = fallback_res.json().get("records", [])
                            if is_generic_query:
                                records = all_records
                            else:
                                clean_query = query_lower
                                if "=" in clean_query:
                                    clean_query = clean_query.split("=", 1)[1].strip(" '\"")
                                elif ":" in clean_query:
                                    clean_query = clean_query.split(":", 1)[1].strip(" '\"")
                                    
                                records = [
                                    r for r in all_records
                                    if any(clean_query in str(v).lower() for v in (r.get("fields") or {}).values())
                                ]
                        else:
                            return f"Airtable API Error ({fallback_res.status_code}): {fallback_res.text[:300]}"
                    else:
                        return f"Airtable API Error ({res.status_code}): {res.text[:300]}"
                else:
                    res = await client.get(url, headers=headers)
                    print(f"[AIRTABLE ADAPTER] List response: status={res.status_code}")
                    if res.is_success:
                        records = res.json().get("records", [])
                    else:
                        return f"Airtable API Error ({res.status_code}): {res.text[:300]}"
                if not records:
                    return f"No matching records found in Airtable table '{table_name}' for '{query_str}'."

                formatted = [f"Record ID: {r.get('id')} | Fields: {r.get('fields')}" for r in records[:10]]
                return f"Successfully retrieved {len(records)} record(s) from Airtable '{table_name}':\n" + "\n".join(formatted)

            # 2. CREATE / WRITE RECORD
            elif any(k in action for k in ("create", "add", "write", "insert", "post")):
                fields = arguments.get("fields") or {}
                if not fields and isinstance(arguments, dict):
                    fields = {k: v for k, v in arguments.items() if k not in ("action", "base_id", "table_name")}

                if not fields:
                    return "Error: 'fields' object is required to create an Airtable record."

                payload = {"fields": fields}
                res = await client.post(url, headers=headers, json=payload)
                print(f"[AIRTABLE ADAPTER] Create response: status={res.status_code}")
                if res.is_success:
                    created = res.json()
                    return f"Successfully created record in Airtable! Record ID: {created.get('id')} | Fields: {created.get('fields')}"
                return f"Airtable API Error ({res.status_code}): {res.text[:300]}"

            # 3. UPDATE / EDIT RECORD
            elif any(k in action for k in ("update", "edit", "patch", "modify")):
                record_id = arguments.get("record_id")
                fields = arguments.get("fields") or {}
                if not record_id or not fields:
                    return "Error: Both 'record_id' and 'fields' are required to update an Airtable record."

                payload = {"fields": fields}
                res = await client.patch(f"{url}/{record_id}", headers=headers, json=payload)
                print(f"[AIRTABLE ADAPTER] Update response: status={res.status_code}")
                if res.is_success:
                    updated = res.json()
                    return f"Successfully updated record {record_id} in Airtable! Fields: {updated.get('fields')}"
                return f"Airtable API Error ({res.status_code}): {res.text[:300]}"

            else:
                # Default listing fallback
                res = await client.get(url, headers=headers)
                print(f"[AIRTABLE ADAPTER] Default list response: status={res.status_code}")
                if res.is_success:
                    records = res.json().get("records", [])
                    formatted = [f"Record ID: {r.get('id')} | Fields: {r.get('fields')}" for r in records[:5]]
                    return f"Airtable Table '{table_name}' Records:\n" + "\n".join(formatted)
                return f"Airtable API Error ({res.status_code}): {res.text[:300]}"

    except Exception as e:
        print(f"[AIRTABLE ADAPTER] Exception: {e}")
        return f"Airtable execution exception: {str(e)}"
