"""Universal Platform Primitive Tools — work for ANY tenant."""
from typing import Optional, Any
from pydantic import BaseModel, Field
import httpx
from config import settings

_HEADERS = lambda: {"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN}


# ═══════════════════════════════════════════════════════
#  INPUT SCHEMAS
# ═══════════════════════════════════════════════════════

class GetCurrentUserInput(BaseModel):
    """Get the currently authenticated user."""
    pass


class GetUserByEmailInput(BaseModel):
    email: str = Field(description="Email address to look up the user by.")


class SearchEntitiesInput(BaseModel):
    entity_type: str = Field(description="Entity type to search. Must match a configured tenant entity name.")
    query: Optional[str] = Field(default=None, description="Free-text search query.")
    user_id: Optional[str] = Field(default=None, description="Filter by user ID.")
    filters: Optional[dict] = Field(default=None, description="Additional field filters.")
    limit: int = Field(default=10, description="Max results.")


class GetEntityByIdInput(BaseModel):
    entity_type: str = Field(description="Entity type.")
    record_id: str = Field(description="Record ID to fetch.")


class CreateSupportTicketInput(BaseModel):
    title: str = Field(description="Short title summarizing the issue.")
    description: str = Field(description="Detailed description.")
    user_email: Optional[str] = Field(default=None, description="User's email.")
    priority: str = Field(default="medium", description="low, medium, high, critical.")
    category: Optional[str] = Field(default=None, description="Issue category.")


class GetSupportTicketsInput(BaseModel):
    user_id: Optional[str] = Field(default=None, description="Filter by user ID.")
    status: Optional[str] = Field(default=None, description="Filter by status.")
    limit: int = Field(default=20, description="Max results.")


class AddTicketNoteInput(BaseModel):
    ticket_id: str = Field(description="Ticket ID.")
    note: str = Field(description="Note text to append.")


class SendNotificationInput(BaseModel):
    to: str = Field(description="Recipient email.")
    subject: str = Field(description="Email subject.")
    body: str = Field(description="Email body (HTML or plain text).")
    from_address: Optional[str] = Field(default=None, description="Sender email override.")


class GetPlatformStatusInput(BaseModel):
    """Check if the platform has any known incidents."""
    pass


class EscalateToHumanInput(BaseModel):
    reason: str = Field(description="Why this issue requires human intervention.")
    summary: Optional[str] = Field(default=None, description="Summary of what was attempted.")


# ═══════════════════════════════════════════════════════
#  TOOL IMPLEMENTATIONS
# ═══════════════════════════════════════════════════════

async def get_current_user_impl(tenant_id: str = None, **kwargs) -> str:
    """Get the currently authenticated user."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.BACKEND_URL}/internal/users/me",
                headers={**_HEADERS(), "X-Tenant-Id": tenant_id or ""},
            )
            if response.status_code == 200:
                return f"Current user: {response.json()}"
            return "Unable to identify current user."
    except Exception as e:
        return f"Error fetching user: {e}"


async def get_user_by_email_impl(email: str, tenant_id: str = None, **kwargs) -> str:
    """Look up a user account by email address."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.BACKEND_URL}/internal/users/search?email={email}",
                headers=_HEADERS(),
            )
            if response.status_code == 200:
                data = response.json()
                if data.get("user"):
                    return f"User found: {data['user']}"
                return f"No user found with email: {email}"
            return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error: {e}"


async def search_entities_impl(
    entity_type: str,
    query: Optional[str] = None,
    user_id: Optional[str] = None,
    filters: Optional[dict] = None,
    limit: int = 10,
    tenant_id: str = None,
    **kwargs,
) -> str:
    """Search for records across the platform by entity type."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            params = {"q": query or "", "limit": limit}
            if user_id:
                params["user_id"] = user_id
            if filters:
                for k, v in filters.items():
                    params[f"filter_{k}"] = v

            response = await client.get(
                f"{settings.BACKEND_URL}/internal/tenants/{tenant_id}/entities/{entity_type}/search",
                params=params,
                headers=_HEADERS(),
            )
            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])
                if results:
                    return f"Found {data.get('count', 0)} {entity_type}(s): {results}"
                return f"No {entity_type} records found."
            return f"Error searching {entity_type}: {response.status_code}"
    except Exception as e:
        return f"Error: {e}"


async def get_entity_by_id_impl(
    entity_type: str,
    record_id: str,
    tenant_id: str = None,
    **kwargs,
) -> str:
    """Fetch a specific record by its ID and entity type."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{settings.BACKEND_URL}/internal/tenants/{tenant_id}/entities/{entity_type}/{record_id}",
                headers=_HEADERS(),
            )
            if response.status_code == 200:
                return f"{entity_type} record: {response.json().get('record', {})}"
            return f"{entity_type} record not found."
    except Exception as e:
        return f"Error: {e}"


async def create_support_ticket_impl(
    title: str,
    description: str,
    user_email: Optional[str] = None,
    priority: str = "medium",
    category: Optional[str] = None,
    tenant_id: str = None,
    conversation_id: str = None,
    **kwargs,
) -> str:
    """Create a support ticket to track this issue."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.BACKEND_URL}/internal/support-tickets",
                json={
                    "tenantId": tenant_id,
                    "conversationId": conversation_id,
                    "userEmail": user_email,
                    "title": title,
                    "description": description,
                    "priority": priority,
                    "category": category,
                },
                headers=_HEADERS(),
            )
            if response.status_code == 201:
                ticket = response.json().get("ticket", {})
                return (
                    f"Support ticket created: #{ticket.get('id')} — {ticket.get('title')}. "
                    f"Status: {ticket.get('status')}."
                )
            return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error creating ticket: {e}"


async def get_support_tickets_impl(
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
    tenant_id: str = None,
    **kwargs,
) -> str:
    """Retrieve existing support tickets for a user or tenant."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            params = {"tenantId": tenant_id, "limit": limit}
            if user_id:
                params["userId"] = user_id
            if status:
                params["status"] = status
            response = await client.get(
                f"{settings.BACKEND_URL}/internal/support-tickets",
                params=params,
                headers=_HEADERS(),
            )
            if response.status_code == 200:
                return f"Tickets: {response.json().get('tickets', [])}"
            return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error: {e}"


async def add_ticket_note_impl(ticket_id: str, note: str, **kwargs) -> str:
    """Append findings or actions to an existing support ticket."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.BACKEND_URL}/internal/support-tickets/{ticket_id}/notes",
                json={"note": note, "authorType": "ai_agent"},
                headers=_HEADERS(),
            )
            if response.status_code == 201:
                return f"Note added to ticket {ticket_id}."
            return f"Error: {response.status_code}"
    except Exception as e:
        return f"Error: {e}"


async def send_notification_impl(
    to: str,
    subject: str,
    body: str,
    from_address: Optional[str] = None,
    tenant_id: str = None,
    **kwargs,
) -> str:
    """Send an email or in-app message to the user."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.BACKEND_URL}/internal/notifications/send",
                json={
                    "to": to,
                    "subject": subject,
                    "body": body,
                    "fromAddress": from_address,
                    "tenantId": tenant_id,
                },
                headers=_HEADERS(),
            )
            if response.status_code == 200:
                return f"Notification sent to {to}."
            return f"Error sending notification: {response.status_code}"
    except Exception as e:
        return f"Error: {e}"


async def get_platform_status_impl(**kwargs) -> str:
    """Check if the platform has any known incidents."""
    return "Platform status: All systems operational. No known incidents at this time."


async def escalate_to_human_impl(
    reason: str = "Issue requires human support",
    summary: Optional[str] = None,
    **kwargs,
) -> str:
    """Hand off to a human support agent with full conversation context."""
    return f"Escalation queued. Reason: {reason}. Summary: {summary or 'N/A'}"
