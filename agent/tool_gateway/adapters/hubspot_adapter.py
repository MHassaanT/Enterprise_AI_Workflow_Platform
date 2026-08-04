"""
HubSpot Adapter — translates CRM tool requests to HubSpot REST API v3 using OAuth2 tokens.
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

    action = arguments.get("action") or tool_name

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if action in ("hubspot_get_contact", "get_contact", "search_contact"):
                email = arguments.get("email")
                if not email:
                    return "Error: 'email' is required to search for a HubSpot contact."
                
                url = "https://api.hubapi.com/crm/v3/objects/contacts/search"
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

            elif action in ("hubspot_create_deal", "create_deal"):
                deal_name = arguments.get("deal_name")
                amount = arguments.get("amount")
                if not deal_name or amount is None:
                    return "Error: 'deal_name' and 'amount' are required to create a deal."
                
                url = "https://api.hubapi.com/crm/v3/objects/deals"
                payload = {
                    "properties": {
                        "dealname": deal_name,
                        "amount": str(amount),
                        "pipeline": arguments.get("pipeline", "default"),
                        "dealstage": arguments.get("dealstage", "appointmentscheduled"),
                    }
                }
                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    deal = res.json()
                    return f"HubSpot deal created successfully! Deal ID: {deal.get('id')}"
                return f"HubSpot Create Deal Error ({res.status_code}): {res.text}"

            elif action in ("hubspot_create_ticket", "create_ticket"):
                subject = arguments.get("subject")
                content = arguments.get("content")
                if not subject:
                    return "Error: 'subject' is required to create a HubSpot ticket."
                
                url = "https://api.hubapi.com/crm/v3/objects/tickets"
                payload = {
                    "properties": {
                        "hs_ticket_priority": arguments.get("priority", "HIGH"),
                        "subject": subject,
                        "content": content or "Created via Enterprise AI Platform Agent",
                        "hs_pipeline_stage": "1"
                    }
                }
                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    ticket = res.json()
                    return f"HubSpot ticket created successfully! Ticket ID: {ticket.get('id')}"
                return f"HubSpot Create Ticket Error ({res.status_code}): {res.text}"

            else:
                return f"Error: Unknown or unsupported HubSpot action '{action}'."
    except Exception as e:
        return f"HubSpot execution exception: {str(e)}"
