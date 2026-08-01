"""
HubSpot Adapter — translates CRM tool requests to HubSpot REST API v3.
"""
from typing import Dict, Any
import httpx


async def execute_hubspot_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    token = credentials.get("access_token") or credentials.get("api_key") or credentials.get("bearer_token")
    if not token:
        return "Error: HubSpot Access Token or API Key is missing from tenant credentials."

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if tool_name == "hubspot_get_contact":
                email = arguments.get("email")
                if not email:
                    return "Error: 'email' is required to search for a HubSpot contact."
                
                url = f"https://api.hubapi.com/crm/v3/objects/contacts/search"
                payload = {
                    "filterGroups": [{
                        "filters": [{
                            "propertyName": "email",
                            "operator": "EQ",
                            "value": email
                        }]
                    }]
                }
                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    results = res.json().get("results", [])
                    if results:
                        contact = results[0]
                        return f"Found HubSpot contact ID {contact.get('id')}: {contact.get('properties')}"
                    return f"No HubSpot contact found matching email '{email}'."
                return f"HubSpot Search Error ({res.status_code}): {res.text}"

            elif tool_name == "hubspot_create_deal":
                deal_name = arguments.get("deal_name")
                amount = arguments.get("amount")
                if not deal_name or amount is None:
                    return "Error: 'deal_name' and 'amount' are required to create a deal."
                
                url = "https://api.hubapi.com/crm/v3/objects/deals"
                payload = {
                    "properties": {
                        "dealname": deal_name,
                        "amount": str(amount),
                        "pipeline": "default",
                        "dealstage": "appointmentscheduled",
                    }
                }
                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    deal = res.json()
                    return f"HubSpot deal created successfully! Deal ID: {deal.get('id')}"
                return f"HubSpot Create Deal Error ({res.status_code}): {res.text}"

            else:
                return f"Error: Unknown HubSpot tool '{tool_name}'."
    except Exception as e:
        return f"HubSpot execution exception: {str(e)}"
