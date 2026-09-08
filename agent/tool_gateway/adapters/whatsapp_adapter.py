"""
WhatsApp Adapter — translates tool requests to the backend's embedded WhatsApp MCP connection.
Communicates over internal HTTP with X-Internal-Token authentication.
"""
from typing import Dict, Any, Optional
import httpx
from config import settings


async def execute_whatsapp_tool(
    tool_name: str,
    arguments: Dict[str, Any],
    credentials: Optional[Dict[str, Any]] = None,
    tenant_id: Optional[str] = None,
    **kwargs,
) -> str:
    """
    Executes WhatsApp tools (whatsapp_send_message, whatsapp_send_media, whatsapp_get_status)
    via the backend's internal WhatsApp MCP service.
    """
    effective_tenant_id = (
        tenant_id
        or arguments.get("tenant_id")
        or (credentials.get("tenant_id") if credentials else None)
        or kwargs.get("tenant_id")
    )

    if not effective_tenant_id:
        return "Error: tenant_id is required to execute WhatsApp tools."

    headers = {
        "Content-Type": "application/json",
        "X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN,
    }

    norm_tool = tool_name.lower().replace("-", "_").replace(" ", "_")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            # 1. Send text message
            if norm_tool in ["whatsapp_send_message", "send_whatsapp", "send_whatsapp_message"]:
                to_addr = arguments.get("to") or arguments.get("phone") or arguments.get("recipient")
                message = arguments.get("message") or arguments.get("text") or arguments.get("body")

                if not to_addr or not message:
                    return "Error: 'to' (phone number) and 'message' (text) are required to send a WhatsApp message."

                payload = {
                    "tenantId": effective_tenant_id,
                    "to": to_addr,
                    "message": message,
                }

                res = await client.post(
                    f"{settings.BACKEND_URL}/internal/whatsapp/send",
                    headers=headers,
                    json=payload,
                )

                if res.is_success:
                    data = res.json()
                    return f"WhatsApp message sent successfully to {to_addr}. Message ID: {data.get('messageId')}"

                return f"WhatsApp API Error ({res.status_code}): {res.text}"

            # 2. Send media message (image, document, audio, video)
            elif norm_tool in ["whatsapp_send_media", "send_whatsapp_media"]:
                to_addr = arguments.get("to") or arguments.get("phone") or arguments.get("recipient")
                media_url = arguments.get("media_url") or arguments.get("url")
                media_type = arguments.get("media_type") or arguments.get("type", "image")
                caption = arguments.get("caption") or arguments.get("message", "")
                filename = arguments.get("filename")

                if not to_addr or not media_url:
                    return "Error: 'to' (phone number) and 'media_url' are required to send WhatsApp media."

                payload = {
                    "tenantId": effective_tenant_id,
                    "to": to_addr,
                    "mediaUrl": media_url,
                    "mediaType": media_type,
                    "caption": caption,
                    "filename": filename,
                }

                res = await client.post(
                    f"{settings.BACKEND_URL}/internal/whatsapp/send",
                    headers=headers,
                    json=payload,
                )

                if res.is_success:
                    data = res.json()
                    return f"WhatsApp {media_type} sent successfully to {to_addr}. Message ID: {data.get('messageId')}"

                return f"WhatsApp API Error ({res.status_code}): {res.text}"

            # 3. Check WhatsApp connection status
            elif norm_tool in ["whatsapp_get_status", "get_whatsapp_status"]:
                res = await client.get(
                    f"{settings.BACKEND_URL}/internal/whatsapp/status/{effective_tenant_id}",
                    headers=headers,
                )

                if res.is_success:
                    data = res.json()
                    status = data.get("status", "disconnected")
                    phone = data.get("phoneNumber") or "None"
                    return f"WhatsApp Status for tenant '{effective_tenant_id}': {status} (Paired phone: {phone})"

                return f"WhatsApp Status Query Error ({res.status_code}): {res.text}"

            # 4. Check if phone numbers exist on WhatsApp via onWhatsApp()
            elif norm_tool in ["whatsapp_check_number", "check_whatsapp", "on_whatsapp", "verify_whatsapp_number"]:
                phones = (
                    arguments.get("phone")
                    or arguments.get("phones")
                    or arguments.get("phone_numbers")
                    or arguments.get("to")
                )
                if not phones:
                    return "Error: 'phone' or 'phone_numbers' is required to check WhatsApp registration."

                targets = [phones] if isinstance(phones, str) else list(phones)

                payload = {
                    "tenantId": effective_tenant_id,
                    "phoneNumbers": targets,
                }

                res = await client.post(
                    f"{settings.BACKEND_URL}/internal/whatsapp/check",
                    headers=headers,
                    json=payload,
                )

                if res.is_success:
                    data = res.json()
                    results = data.get("results", [])
                    formatted = [
                        f"{r.get('jid', 'Unknown')}: {'Registered' if r.get('exists') else 'Not on WhatsApp'}"
                        for r in results
                    ]
                    return f"WhatsApp Registration Check Results:\n" + "\n".join(formatted) if formatted else "No records found."

                return f"WhatsApp Check Error ({res.status_code}): {res.text}"

            else:
                return f"Error: Unsupported WhatsApp tool action '{tool_name}'."

    except Exception as e:
        return f"WhatsApp execution exception: {str(e)}"
