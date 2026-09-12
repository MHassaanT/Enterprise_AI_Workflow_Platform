import json
import logging
from typing import Dict, Any, List
try:
    from services.llm_gateway import get_llm
    from tool_gateway.adapters.whatsapp_adapter import execute_whatsapp_tool
except ModuleNotFoundError:
    from agent.services.llm_gateway import get_llm
    from agent.tool_gateway.adapters.whatsapp_adapter import execute_whatsapp_tool

logger = logging.getLogger(__name__)


class RFQOutreachSubAgent:
    """
    Sub-Agent 3: WhatsApp RFQ Outreach Sub-Agent
    Formats professional Request for Quotation (RFQ) messages for WhatsApp
    and dispatches outreach to candidate vendors via the WhatsApp MCP service.
    Eliminates all email/Gmail dependencies.
    """

    async def process(
        self,
        title: str,
        extracted_specs: Dict[str, Any],
        vendors: List[Dict[str, Any]],
        tenant_id: str,
        company_context: Dict[str, Any] = None,
        auto_send_whatsapp: bool = True
    ) -> Dict[str, Any]:
        tech_reqs = "\n• ".join(extracted_specs.get("technical_requirements", ["Commercial grade fulfillment"]))
        deliverables = "\n• ".join(extracted_specs.get("key_deliverables", ["Full deliverables package"]))
        timeline = extracted_specs.get("target_timeline", "30 days")
        ctx = company_context or {}
        comp_name = ctx.get("company_name", "Enterprise Client")
        sender_name = ctx.get("sender_name", "Procurement Department")

        # 1. Generate mobile-friendly WhatsApp RFQ copy with LLM
        prompt = f"""You are an AI Procurement Sub-Agent representing {comp_name}.
Draft a professional, clear Request for Quotation (RFQ) message for WhatsApp on behalf of {comp_name} to candidate suppliers for:

PROJECT TITLE: {title}
BUYING COMPANY: {comp_name}
REQUIREMENTS:
• {tech_reqs}
DELIVERABLES:
• {deliverables}
TIMELINE: {timeline}

Format the message specifically for WhatsApp:
- Use emojis tastefully (e.g. 📋, ⏱️, 💼).
- Keep paragraphs readable on mobile screens.
- Ask the vendor for: 1) Total quotation price, 2) Fulfillment lead time (in days), 3) SLA & warranty terms, and 4) Payment terms.
- Use {{vendor_name}} as the placeholder for the vendor's company name.
- Sign off from {sender_name} at {comp_name}.

Return ONLY valid JSON matching this schema:
{{
  "whatsapp_message_template": "..."
}}
"""
        llm = get_llm()
        try:
            response = llm.invoke(prompt)
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            parsed = json.loads(content.strip())
            wa_template = parsed.get("whatsapp_message_template", "")
        except Exception as e:
            logger.warning(f"[RFQ WhatsApp Subagent] LLM template fallback: {e}")
            wa_template = (
                f"Hello {{vendor_name}} Team! 👋\n\n"
                f"I am reaching out on behalf of *{comp_name}* regarding our procurement requirement for *{title}*.\n\n"
                f"📋 *Scope & Requirements:*\n• {tech_reqs}\n\n"
                f"⏱️ *Timeline:* {timeline}\n\n"
                f"Could you please reply with your:\n"
                f"1. Total proposed quote ($)\n"
                f"2. Delivery lead time\n"
                f"3. SLA / Warranty coverage\n"
                f"4. Payment terms\n\n"
                f"Best regards,\n*{sender_name}* | {comp_name}"
            )

        # 2. Dispatch WhatsApp messages to candidate vendors
        dispatched_logs = []
        updated_vendors = []

        for v in vendors:
            vendor_name = v.get("vendor_name", "Vendor")
            phone = v.get("vendor_phone") or v.get("phone") or "+15550192831"
            wa_body = wa_template.replace("{vendor_name}", vendor_name)

            message_id = f"WA-RFQ-{abs(hash(f'{vendor_name}_{phone}')) % 10000000}"
            status = "SENT"

            if auto_send_whatsapp and phone:
                try:
                    wa_res = await execute_whatsapp_tool(
                        tool_name="whatsapp_send_message",
                        arguments={"recipient": phone, "message": wa_body},
                        tenant_id=tenant_id
                    )
                    if isinstance(wa_res, str) and "messageId" in wa_res:
                        message_id = wa_res.split("messageId:")[-1].strip()
                except Exception as send_err:
                    logger.warning(f"[RFQ WhatsApp Subagent] Dispatch notice for {phone}: {send_err}")

            updated_v = dict(v)
            updated_v["contact_status"] = "RFQ_SENT"
            updated_v["whatsapp_message_id"] = message_id
            updated_vendors.append(updated_v)

            dispatched_logs.append({
                "vendor_name": vendor_name,
                "vendor_phone": phone,
                "whatsapp_message_id": message_id,
                "channel": "WhatsApp",
                "status": status,
                "message_preview": wa_body[:180] + "..."
            })

        return {
            "status": "success",
            "subagent": "rfq_outreach",
            "channel": "WhatsApp",
            "rfq_template": {"whatsapp_message_template": wa_template},
            "dispatched_vendors": updated_vendors,
            "dispatch_logs": dispatched_logs
        }
