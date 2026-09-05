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


class RescheduleAppointmentInput(BaseModel):
    new_date: str = Field(
        ...,
        description="The new preferred date for the appointment in YYYY-MM-DD format (e.g. '2026-09-08')."
    )
    new_time: str = Field(
        ...,
        description="The new preferred time for the appointment (e.g. '14:00', '2:30 PM', '10:00 AM')."
    )
    appointment_id: Optional[str] = Field(
        None,
        description="The unique ID (UUID) or list index (e.g. '1', '2') of the appointment to reschedule (from get_appointments)."
    )
    customer_email: Optional[str] = Field(
        None,
        description="The customer's email address to locate their scheduled appointment."
    )
    notes: Optional[str] = Field(
        "",
        description="Optional reason for rescheduling or updated agenda/notes."
    )


class CancelAppointmentInput(BaseModel):
    appointment_id: Optional[str] = Field(
        None,
        description="The unique ID (UUID) or list index (e.g. '1', '2') of the appointment to cancel from get_appointments, or 'all' to cancel all active bookings."
    )
    customer_email: Optional[str] = Field(
        None,
        description="The customer's email address to locate their scheduled appointment(s)."
    )
    reason: Optional[str] = Field(
        "",
        description="Reason for cancellation provided by the customer."
    )


class EditAppointmentInput(BaseModel):
    appointment_id: Optional[str] = Field(
        None,
        description="The unique ID (UUID) or list index (e.g. '1', '2') of the appointment to edit (from get_appointments)."
    )
    customer_email: Optional[str] = Field(
        None,
        description="The customer's current email address to locate their scheduled appointment."
    )
    new_name: Optional[str] = Field(
        None,
        description="New full name of the customer (use when customer wants to change their name on the appointment)."
    )
    new_email: Optional[str] = Field(
        None,
        description="New email address of the customer (use when customer wants to change their contact email on the appointment)."
    )
    new_phone: Optional[str] = Field(
        None,
        description="New phone number of the customer (use when customer wants to update their phone)."
    )
    new_date: Optional[str] = Field(
        None,
        description="New appointment date in YYYY-MM-DD format (use when rescheduling/changing date)."
    )
    new_time: Optional[str] = Field(
        None,
        description="New appointment time e.g. '14:00' or '2:30 PM' (use when rescheduling/changing time)."
    )
    duration_minutes: Optional[int] = Field(
        None,
        description="New duration in minutes (default: 60)."
    )
    notes: Optional[str] = Field(
        None,
        description="Updated agenda, discussion topics, or reason for modification."
    )
    status: Optional[str] = Field(
        None,
        description="Updated appointment status ('scheduled', 'cancelled', 'completed')."
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
            for idx, a in enumerate(appts, 1):
                appt_date = str(a.get("appointment_date", ""))[:10]
                lines.append(
                    f"{idx}. [ID: {a.get('id')}] [{a.get('status', 'scheduled').upper()}] {appt_date} at {a.get('appointment_time')} - "
                    f"{a.get('service_type')} for {a.get('customer_name')} ({a.get('customer_email')})"
                )
            return "\n".join(lines)
        else:
            return f"Error retrieving appointments: {res.text}"
    except Exception as e:
        return f"System error retrieving appointments: {str(e)}"


async def reschedule_appointment_impl(
    new_date: str,
    new_time: str,
    appointment_id: Optional[str] = None,
    customer_email: Optional[str] = None,
    notes: Optional[str] = "",
    tenant_id: Optional[str] = None,
    **kwargs: Any,
) -> str:
    """
    Reschedules an existing scheduled appointment to a new date and time.
    """
    if not tenant_id:
        return "Error: tenant_id is required to reschedule an appointment."

    clean_date = (new_date or "").strip()
    clean_time = (new_time or "").strip()
    clean_id = (appointment_id or "").strip() if appointment_id else None
    clean_email = (customer_email or "").strip().lower() if customer_email else None

    if not clean_date or not clean_time:
        return "Error: Both new_date (YYYY-MM-DD) and new_time are required to reschedule."

    if not clean_id and not clean_email:
        return "Error: Please provide either the appointment_id or the customer_email to locate the appointment."

    payload = {
        "tenantId": tenant_id,
        "appointment_id": clean_id,
        "customer_email": clean_email,
        "new_date": clean_date,
        "new_time": clean_time,
        "notes": (notes or "").strip(),
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                f"{settings.BACKEND_URL}/internal/appointments/reschedule",
                headers=_HEADERS(),
                json=payload,
            )

        if res.status_code == 200:
            data = res.json()
            appt = data.get("appointment", {})
            appt_id = data.get("appointment_id", appt.get("id", "N/A"))
            return (
                f"Appointment rescheduled successfully!\n"
                f"- Appointment ID: {appt_id}\n"
                f"- Customer: {appt.get('customer_name', 'N/A')} ({appt.get('customer_email', '')})\n"
                f"- Service: {appt.get('service_type', 'Consultation')}\n"
                f"- New Date & Time: {clean_date} at {clean_time}\n"
                f"- Status: Scheduled"
            )
        else:
            err_msg = res.json().get("error", res.text) if res.headers.get("content-type", "").startswith("application/json") else res.text
            return f"Failed to reschedule appointment: {err_msg}"
    except Exception as e:
        return f"System error rescheduling appointment: {str(e)}"


async def cancel_appointment_impl(
    appointment_id: Optional[str] = None,
    customer_email: Optional[str] = None,
    reason: Optional[str] = "",
    tenant_id: Optional[str] = None,
    **kwargs: Any,
) -> str:
    """
    Cancels an existing scheduled appointment.
    """
    if not tenant_id:
        return "Error: tenant_id is required to cancel an appointment."

    clean_id = (appointment_id or "").strip() if appointment_id else None
    clean_email = (customer_email or "").strip().lower() if customer_email else None

    if not clean_id and not clean_email:
        return "Error: Please provide either the appointment_id or the customer_email to cancel."

    payload = {
        "tenantId": tenant_id,
        "appointment_id": clean_id,
        "customer_email": clean_email,
        "reason": (reason or "").strip(),
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                f"{settings.BACKEND_URL}/internal/appointments/cancel",
                headers=_HEADERS(),
                json=payload,
            )

        if res.status_code == 200:
            data = res.json()
            appt = data.get("appointment", {})
            appt_id = data.get("appointment_id", appt.get("id", "N/A"))
            count = data.get("cancelled_count")
            if count and count > 1:
                return (
                    f"All {count} active appointments cancelled successfully!\n"
                    f"- Customer: {clean_email or appt.get('customer_email', '')}\n"
                    f"- Status: Cancelled"
                )
            return (
                f"Appointment cancelled successfully!\n"
                f"- Appointment ID: {appt_id}\n"
                f"- Customer: {appt.get('customer_name', 'N/A')} ({appt.get('customer_email', clean_email or '')})\n"
                f"- Service: {appt.get('service_type', 'Consultation')}\n"
                f"- Status: Cancelled"
            )
        else:
            err_msg = res.json().get("error", res.text) if res.headers.get("content-type", "").startswith("application/json") else res.text
            return f"Failed to cancel appointment: {err_msg}"
    except Exception as e:
        return f"System error cancelling appointment: {str(e)}"


async def edit_appointment_impl(
    appointment_id: Optional[str] = None,
    customer_email: Optional[str] = None,
    new_name: Optional[str] = None,
    new_email: Optional[str] = None,
    new_phone: Optional[str] = None,
    new_date: Optional[str] = None,
    new_time: Optional[str] = None,
    duration_minutes: Optional[int] = None,
    notes: Optional[str] = None,
    status: Optional[str] = None,
    tenant_id: Optional[str] = None,
    **kwargs: Any,
) -> str:
    """
    Universally edits an existing appointment (change name, email, phone, reschedule date/time, update notes, or cancel/change status).
    """
    if not tenant_id:
        return "Error: tenant_id is required to edit an appointment."

    clean_id = (appointment_id or "").strip() if appointment_id else None
    clean_email = (customer_email or "").strip().lower() if customer_email else None

    if not clean_id and not clean_email:
        return "Error: Please provide either the appointment_id or the customer_email to locate the appointment."

    payload = {
        "tenantId": tenant_id,
        "appointment_id": clean_id,
        "customer_email": clean_email,
        "new_name": (new_name or "").strip() if new_name else None,
        "new_email": (new_email or "").strip().lower() if new_email else None,
        "new_phone": (new_phone or "").strip() if new_phone else None,
        "new_date": (new_date or "").strip() if new_date else None,
        "new_time": (new_time or "").strip() if new_time else None,
        "duration_minutes": duration_minutes,
        "notes": (notes or "").strip() if notes else None,
        "status": (status or "").strip().lower() if status else None,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                f"{settings.BACKEND_URL}/internal/appointments/edit",
                headers=_HEADERS(),
                json=payload,
            )

        if res.status_code == 200:
            data = res.json()
            appt = data.get("appointment", {})
            appt_id = data.get("appointment_id", appt.get("id", "N/A"))
            date_str = str(appt.get("appointment_date", ""))[:10]
            return (
                f"Appointment successfully updated!\n"
                f"- Appointment ID: {appt_id}\n"
                f"- Customer Name: {appt.get('customer_name', 'N/A')}\n"
                f"- Customer Email: {appt.get('customer_email', 'N/A')}\n"
                f"- Service: {appt.get('service_type', 'Consultation')}\n"
                f"- Date & Time: {date_str} at {appt.get('appointment_time', 'N/A')}\n"
                f"- Status: {appt.get('status', 'scheduled').capitalize()}"
            )
        else:
            err_msg = res.json().get("error", res.text) if res.headers.get("content-type", "").startswith("application/json") else res.text
            return f"Failed to edit appointment: {err_msg}"
    except Exception as e:
        return f"System error editing appointment: {str(e)}"


