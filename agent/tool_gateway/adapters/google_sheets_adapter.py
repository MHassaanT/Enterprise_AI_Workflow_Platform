"""
Google Sheets Adapter — translates tool requests to Google Sheets REST API (v4).
Injects decrypted OAuth2 access token as Bearer token into HTTP headers.
"""
from typing import Dict, Any
import httpx


async def execute_google_sheets_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    """
    Executes Google Sheets API calls (read cell range, update rows/range, create spreadsheet) using tenant OAuth access token.
    """
    token = credentials.get("access_token") or credentials.get("bearer_token")
    if not token:
        return "Error: Google Sheets access token is missing from tenant credentials. Please connect Google Sheets via OAuth2."

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    action = arguments.get("action") or tool_name
    action_lower = action.lower()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Create New Spreadsheet
            if "create" in action_lower or "new" in action_lower or "create_spreadsheet" in action_lower:
                title = arguments.get("title") or "Untitled Spreadsheet"
                url = "https://sheets.googleapis.com/v4/spreadsheets"
                payload = {
                    "properties": {
                        "title": title
                    }
                }

                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    sheet_data = res.json()
                    sheet_id = sheet_data.get("spreadsheetId")
                    sheet_url = sheet_data.get("spreadsheetUrl")
                    return f"Successfully created Google Sheet '{title}' (Spreadsheet ID: {sheet_id}, URL: {sheet_url})."

                if res.status_code == 429:
                    return "Error: Google Sheets API rate limit exceeded (HTTP 429). Please try again later."
                return f"Google Sheets API Error ({res.status_code}): {res.text}"

            # 2. Update Rows / Cell Range
            elif "update" in action_lower or "row" in action_lower or "write" in action_lower or "append" in action_lower or "update_rows" in action_lower:
                sheet_id = arguments.get("spreadsheet_id") or arguments.get("spreadsheetId") or arguments.get("id")
                cell_range = arguments.get("range") or arguments.get("cell_range") or "Sheet1!A1"
                values = arguments.get("values") or arguments.get("rows") or []

                if not sheet_id:
                    return "Error: 'spreadsheet_id' is required to update rows in a Google Sheet."
                if not values:
                    return "Error: 'values' (2D array of rows) is required to update rows in a Google Sheet."

                # If values is passed as 1D list (e.g. ["val1", "val2"]), wrap in a 2D list
                if isinstance(values, list) and values and not isinstance(values[0], list):
                    values = [values]

                mode = arguments.get("mode", "update")
                if "append" in action_lower or mode == "append":
                    url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{cell_range}:append?valueInputOption=USER_ENTERED"
                    payload = {
                        "range": cell_range,
                        "majorDimension": "ROWS",
                        "values": values
                    }
                    res = await client.post(url, headers=headers, json=payload)
                else:
                    url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{cell_range}?valueInputOption=USER_ENTERED"
                    payload = {
                        "range": cell_range,
                        "majorDimension": "ROWS",
                        "values": values
                    }
                    res = await client.put(url, headers=headers, json=payload)

                if res.is_success:
                    res_json = res.json()
                    updated_cells = res_json.get("updatedCells") or res_json.get("updates", {}).get("updatedCells")
                    return f"Successfully updated Google Sheet (ID: {sheet_id}, Range: {cell_range}, Updated Cells: {updated_cells})."

                if res.status_code == 429:
                    return "Error: Google Sheets API rate limit exceeded (HTTP 429). Please try again later."
                return f"Google Sheets API Error ({res.status_code}): {res.text}"

            # 3. Read Cell Range
            elif "read" in action_lower or "get" in action_lower or "fetch" in action_lower or "read_range" in action_lower:
                sheet_id = arguments.get("spreadsheet_id") or arguments.get("spreadsheetId") or arguments.get("id")
                cell_range = arguments.get("range") or arguments.get("cell_range") or "A1:Z100"

                if not sheet_id:
                    return "Error: 'spreadsheet_id' is required to read a Google Sheet."

                url = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{cell_range}"
                res = await client.get(url, headers=headers)
                if res.is_success:
                    val_data = res.json()
                    rows = val_data.get("values", [])
                    if not rows:
                        return f"No values found in Google Sheet (ID: {sheet_id}) for range '{cell_range}'."
                    return f"Google Sheet Range '{cell_range}' Values ({len(rows)} rows):\n{rows}"

                if res.status_code == 429:
                    return "Error: Google Sheets API rate limit exceeded (HTTP 429). Please try again later."
                return f"Google Sheets API Error ({res.status_code}): {res.text}"

            else:
                return f"Error: Unsupported Google Sheets action '{action}'."

    except Exception as e:
        return f"Google Sheets execution exception: {str(e)}"
