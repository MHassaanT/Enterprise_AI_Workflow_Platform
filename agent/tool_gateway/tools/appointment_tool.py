"""
Appointment Tool — Enables AI agents to book and query service appointments
(consultations, service sessions, discovery meetings) for service businesses
such as software development companies, cleaning services, maintenance agencies, etc.
"""
from typing import Optional, Dict, Any
import httpx
from pydantic import BaseModel, Field
from config import settings


class CreateAppointmentInput(BaseModel):
    customer_name: str = Field(
        ...,
        description="Full name of the customer booking the appointment."
    )
    customer_email: str = Field(
        ...,
        description="Email address of the customer for confirmation and reminders."
    )
    customer_phone: Optional[str] = Field(
        None,
        description="Phone number or WhatsApp of the customer (optional but recommended)."
    )
    service_type: str = Field(
        ...,
        description="Type of service, meeting, or appointment requested (e.g., 'Partnership & Business Development Discussion', 'Software Consultation', 'Cleaning Service', 'Enterprise Demo', 'Technical Scoping Meeting')."
    )
    appointment_date: str = Field(
        ...,
        description="Date for the appointment in YYYY-MM-DD format (e.g., '2026-09-15')."
    )
    appointment_time: str = Field(
        ...,
        description="Preferred time of the appointment (e.g., '14:00', '2:30 PM', '10:00 AM')."
    )
    duration_minutes: Optional[int] = Field(
        60,
        description="Estimated duration of the appointment in minutes. Defaults to 60."
    )
    notes: Optional[str] = Field(
        "",
        description="Meeting agenda, discussion topics, partnership proposal details, project requirements, or service notes."
    )


class GetAppointmentsInput(BaseModel):
    date: Optional[str] = Field(
        None,
        description="Filter appointments by date in YYYY-MM-DD format to check availability."
    )
    customer_email: Optional[str] = Field(
        None,
        description="Filter appointments by customer email address."
    )
    status: Optional[str] = Field(
        None,
        description="Filter by appointment status ('scheduled', 'completed', 'cancelled')."
    )


_HEADERS = lambda: {"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN}


async def create_appointment_impl(
    customer_name: str,
    customer_email: str,
    service_type: str,
    appointment_date: str,
    appointment_time: str,
    customer_phone: Optional[str] = None,
    duration_minutes: Optional[int] = 60,
    notes: Optional[str] = "",
    tenant_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    **kwargs: Any,
) -> str:
    """
    Creates an appointment booking in the platform database via the internal backend API.
    """
    if not tenant_id:
        return "Error: tenant_id is required to book an appointment."

    clean_name = (customer_name or "").strip()
    clean_email = (customer_email or "").strip().lower()
    clean_service = (service_type or "").strip()
    clean_date = (appointment_date or "").strip()
    clean_time = (appointment_time or "").strip()

    if not clean_name or not clean_email or not clean_service or not clean_date or not clean_time:
        return (
            "Error: Incomplete appointment details. Please provide customer name, "
            "email, service type, appointment date (YYYY-MM-DD), and preferred time."
        )

    payload = {
        "tenantId": tenant_id,
        "conversationId": conversation_id or kwargs.get("conversation_id", None),
        "customer_name": clean_name,
        "customer_email": clean_email,
        "customer_phone": (customer_phone or "").strip() if customer_phone else None,
        "service_type": clean_service,
        "appointment_date": clean_date,
        "appointment_time": clean_time,
        "duration_minutes": duration_minutes or 60,
        "notes": (notes or "").strip(),
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                f"{settings.BACKEND_URL}/internal/appointments",
                headers=_HEADERS(),
                json=payload,
            )

        if res.status_code in (200, 201):
            data = res.json()
            appt = data.get("appointment", {})
            appt_id = data.get("appointment_id", appt.get("id", "N/A"))
            return (
                f"Appointment booked successfully!\n"
                f"- Appointment ID: {appt_id}\n"
                f"- Service: {clean_service}\n"
                f"- Customer: {clean_name} ({clean_email})\n"
                f"- Date & Time: {clean_date} at {clean_time} ({duration_minutes or 60} mins)\n"
                f"- Status: Scheduled"
            )
        else:
            err_msg = res.json().get("error", res.text) if res.headers.get("content-type", "").startswith("application/json") else res.text
            return f"Failed to book appointment: {err_msg}"
    except Exception as e:
        return f"System error booking appointment: {str(e)}"


async def get_appointments_impl(
    date: Optional[str] = None,
    customer_email: Optional[str] = None,
    status: Optional[str] = None,
    tenant_id: Optional[str] = None,
    **kwargs: Any,
) -> str:
    """
    Queries existing appointments for a tenant to check availability or verify bookings.
    """
    if not tenant_id:
        return "Error: tenant_id is required to query appointments."

    params = {"tenantId": tenant_id}
    if date:
        params["date"] = date.strip()
    if customer_email:
        params["email"] = customer_email.strip().lower()
    if status:
        params["status"] = status.strip().lower()

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"{settings.BACKEND_URL}/internal/appointments",
                headers=_HEADERS(),
                params=params,
            )

        if res.status_code == 200:
            data = res.json()
            appts = data.get("appointments", [])
            if not appts:
                return "No existing appointments found matching the query criteria."

            lines = [f"Found {len(appts)} appointment(s):"]
            for a in appts:
                appt_date = str(a.get("appointment_date", ""))[:10]
                lines.append(
                    f"• [{a.get('status', 'scheduled').upper()}] {appt_date} at {a.get('appointment_time')} - "
                    f"{a.get('service_type')} for {a.get('customer_name')} ({a.get('customer_email')})"
                )
            return "\n".join(lines)
        else:
            return f"Error retrieving appointments: {res.text}"
    except Exception as e:
        return f"System error retrieving appointments: {str(e)}"
