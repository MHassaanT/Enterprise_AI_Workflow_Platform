"""
Resend Adapter — translates email send tool requests to Resend REST API.
"""
from typing import Dict, Any
import httpx


async def execute_resend_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    api_key = credentials.get("api_key") or credentials.get("bearer_token")
    if not api_key:
        return "Error: Resend API Key is missing from tenant credentials."

    if tool_name != "resend_send_email":
        return f"Error: Unknown Resend tool '{tool_name}'."

    to_addr = arguments.get("to")
    subject = arguments.get("subject")
    body = arguments.get("body")
    from_addr = arguments.get("from_address") or credentials.get("from_address") or "onboarding@resend.dev"

    if not to_addr or not subject or not body:
        return "Error: 'to', 'subject', and 'body' parameters are required for sending email."

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "from": from_addr,
        "to": [to_addr] if isinstance(to_addr, str) else to_addr,
        "subject": subject,
        "html": f"<p>{body}</p>",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post("https://api.resend.com/emails", headers=headers, json=payload)
            if res.is_success:
                data = res.json()
                return f"Email sent successfully via Resend. Email ID: {data.get('id')}"
            return f"Resend API Error ({res.status_code}): {res.text}"
    except Exception as e:
        return f"Resend execution exception: {str(e)}"
