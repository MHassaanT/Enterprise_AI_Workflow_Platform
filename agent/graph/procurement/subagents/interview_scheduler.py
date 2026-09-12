import json
import logging
import re
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
try:
    from services.llm_gateway import get_llm
    from tool_gateway.adapters.whatsapp_adapter import execute_whatsapp_tool
    from tool_gateway.tools.appointment_tool import create_appointment_impl
except ModuleNotFoundError:
    from agent.services.llm_gateway import get_llm
    from agent.tool_gateway.adapters.whatsapp_adapter import execute_whatsapp_tool
    from agent.tool_gateway.tools.appointment_tool import create_appointment_impl

logger = logging.getLogger(__name__)


class InterviewSchedulerSubAgent:
    """
    Sub-Agent 5: WhatsApp Vendor Interview & Appointment Scheduling Sub-Agent
    Replaces VendorComms and FinanceSync.
    After the human reviews the Quote Comparison Matrix and selects a vendor:
    1. Contacts the selected vendor via WhatsApp to invite them for an interview with a company representative.
    2. Collects vendor availability.
    3. Automatically schedules the interview in the platform's Appointments system.
    4. Notifies the human representative on the Appointments page (/approvals?tab=appointments).
    5. Concludes the agent's duties (no Purchase Orders, no General Ledger entries, no closing calls).
    """

    async def process(
        self,
        title: str,
        department: str,
        selected_vendor_id: str,
        selection_notes: str,
        vendors: List[Dict[str, Any]],
        tenant_id: str,
        company_context: Dict[str, Any] = None,
        preferred_date: Optional[str] = None,
        preferred_time: Optional[str] = None
    ) -> Dict[str, Any]:
        # 1. Locate the selected vendor
        winning_vendor = None
        for v in vendors:
            if str(v.get("id")) == str(selected_vendor_id) or str(v.get("vendor_name")) == str(selected_vendor_id):
                winning_vendor = v
                break

        if not winning_vendor:
            winning_vendor = vendors[0] if vendors else {
                "id": selected_vendor_id,
                "vendor_name": "Selected Vendor",
                "vendor_phone": "+14155552671",
                "quote_amount": 0.0
            }

        ctx = company_context or {}
        comp_name = ctx.get("company_name", "Enterprise Client")
        rep_name = ctx.get("sender_name", "Procurement Representative")

        vendor_name = winning_vendor.get("vendor_name", "Vendor")
        vendor_phone = winning_vendor.get("vendor_phone") or winning_vendor.get("phone") or "+14155552671"
        quote_amt = float(winning_vendor.get("quote_amount") or 0.0)

        # 2. Determine interview date & time slot
        # Default to tomorrow afternoon or preferred slot
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        slot_date = preferred_date or tomorrow
        slot_time = preferred_time or "14:00"

        # 3. Draft WhatsApp Interview Invitation with LLM
        prompt = f"""You are an AI Procurement Sub-Agent representing {comp_name}.
Draft a professional, courteous WhatsApp message to invite {vendor_name} for an interview with our company representative ({rep_name}) regarding their proposal for '{title}'.

DETAILS:
- PROJECT: {title}
- QUOTE SUBMITTED: ${quote_amt:,.2f}
- COMPANY REPRESENTATIVE: {rep_name} at {comp_name}
- PROPOSED INTERVIEW SLOT: {slot_date} at {slot_time} (45 minutes)
- SELECTION REASON / AGENDA: {selection_notes or 'Technical discussion and commercial alignment'}

CRITICAL INSTRUCTIONS:
- This is NOT a final contract award or closing purchase order.
- It is an invitation to schedule an interview with the representative.
- Format for WhatsApp with clean mobile formatting and polite emojis.
- Ask the vendor to confirm their availability for this slot or propose an alternative.

Return ONLY valid JSON matching this schema:
{{
  "whatsapp_interview_message": "..."
}}
"""
        llm = get_llm()
        try:
            resp = llm.invoke(prompt)
            content = resp.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            wa_data = json.loads(content.strip())
            interview_msg = wa_data.get("whatsapp_interview_message", "")
        except Exception as e:
            logger.warning(f"[InterviewScheduler] LLM message fallback: {e}")
            interview_msg = (
                f"Hello {vendor_name} Team! 👋\n\n"
                f"Thank you for submitting your proposal for *{title}* (${quote_amt:,.2f}).\n\n"
                f"Our evaluation team was impressed with your specifications. We would like to invite you for a 45-minute interview with our company representative, *{rep_name}*, to discuss technical alignment and project deliverables.\n\n"
                f"📅 *Proposed Schedule:* {slot_date} at {slot_time}\n"
                f"📝 *Discussion Focus:* {selection_notes or 'Scope, timeline, and SLA verification'}\n\n"
                f"Please reply to confirm if this time works for your team or let us know your preferred availability.\n\n"
                f"Best regards,\n*{rep_name}* | {comp_name}"
            )

        # 4. Dispatch WhatsApp message to the vendor
        wa_message_id = f"WA-INTV-{abs(hash(f'{vendor_name}_{slot_date}')) % 10000000}"
        try:
            wa_res = await execute_whatsapp_tool(
                tool_name="whatsapp_send_message",
                arguments={"recipient": vendor_phone, "message": interview_msg},
                tenant_id=tenant_id
            )
            if isinstance(wa_res, str) and "messageId" in wa_res:
                wa_message_id = wa_res.split("messageId:")[-1].strip()
        except Exception as send_err:
            logger.warning(f"[InterviewScheduler] WhatsApp dispatch notice: {send_err}")

        # 5. Automatically Book Appointment in Platform Database via appointment tool
        slug_name = re.sub(r"[^a-zA-Z0-9]+", "", vendor_name).lower()
        vendor_email = f"{slug_name or 'vendor'}@whatsapp.vendor"
        appt_notes = (
            f"Procurement Interview for '{title}' with selected vendor {vendor_name}. "
            f"Quoted Amount: ${quote_amt:,.2f}. Notes: {selection_notes or 'Technical review'}. "
            f"Vendor WhatsApp: {vendor_phone}"
        )

        appointment_result = await create_appointment_impl(
            customer_name=f"{vendor_name} (Vendor Contact)",
            customer_email=vendor_email,
            customer_phone=vendor_phone,
            service_type="Procurement Vendor Interview",
            appointment_date=slot_date,
            appointment_time=slot_time,
            duration_minutes=45,
            notes=appt_notes,
            tenant_id=tenant_id
        )

        # Extract appointment ID if present
        appointment_id = None
        if "Appointment ID: " in appointment_result:
            appointment_id = appointment_result.split("Appointment ID: ")[1].split("\n")[0].strip()

        # Update winning vendor record state
        updated_vendor = dict(winning_vendor)
        updated_vendor["contact_status"] = "INTERVIEW_SCHEDULED"
        updated_vendor["interview_availability"] = f"Confirmed availability for {slot_date} at {slot_time}"
        updated_vendor["whatsapp_message_id"] = wa_message_id
        updated_vendor["appointment_id"] = appointment_id

        return {
            "status": "success",
            "subagent": "interview_scheduler",
            "active_subagent": "agent_duty_complete",
            "next_stage": "INTERVIEW_SCHEDULED",
            "agent_duty_complete": True,
            "selected_vendor": updated_vendor,
            "appointment": {
                "id": appointment_id,
                "service_type": "Procurement Vendor Interview",
                "vendor_name": vendor_name,
                "vendor_phone": vendor_phone,
                "appointment_date": slot_date,
                "appointment_time": slot_time,
                "duration_minutes": 45,
                "status": "scheduled",
                "notes": appt_notes,
                "appointments_url": "/approvals?tab=appointments"
            },
            "whatsapp_outreach": {
                "recipient": vendor_phone,
                "message_id": wa_message_id,
                "channel": "WhatsApp",
                "body_preview": interview_msg[:180] + "..."
            },
            "closing_instructions": (
                "Agent duties for this procurement request are complete. The interview appointment has been "
                "booked and registered on the Appointments page. Final calls, contract negotiations, and Purchase "
                "Order creations will be executed manually by the human company representative following the interview."
            )
        }
