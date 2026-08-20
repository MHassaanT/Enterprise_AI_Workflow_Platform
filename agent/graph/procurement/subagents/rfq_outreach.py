import json
from typing import Dict, Any, List
from agent.services.llm_gateway import get_llm

class RFQOutreachSubAgent:
    """
    Sub-Agent 3: RFQ Outreach Sub-Agent
    Formats formal Request for Quotation (RFQ) communications and dispatches emails to candidate vendors.
    """

    def process(self, title: str, extracted_specs: Dict[str, Any], vendors: List[Dict[str, Any]], tenant_id: str) -> Dict[str, Any]:
        tech_reqs = "\n- ".join(extracted_specs.get("technical_requirements", ["Standard specification"]))
        deliverables = "\n- ".join(extracted_specs.get("key_deliverables", ["Full fulfillment"]))
        timeline = extracted_specs.get("target_timeline", "30 days")

        prompt = f"""You are an AI Procurement Sub-Agent specializing in vendor communications.
Draft a professional Request for Quotation (RFQ) email template for:

PROJECT TITLE: {title}
REQUIREMENTS:
- {tech_reqs}
DELIVERABLES:
- {deliverables}
TIMELINE: {timeline}

Draft a template JSON object with:
1. "subject": Crisp professional email subject line.
2. "body_template": The email text body requesting a detailed quotation, pricing tiers, lead time, and SLA terms. Use {{vendor_name}} as placeholder.

Return ONLY valid JSON matching this schema:
{{
  "subject": "...",
  "body_template": "..."
}}
"""
        llm = get_llm()
        response = llm.invoke(prompt)

        try:
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            rfq_template = json.loads(content.strip())
        except Exception:
            rfq_template = {
                "subject": f"Request for Quotation (RFQ) - {title}",
                "body_template": f"Dear {{vendor_name}} Team,\n\nOur enterprise is currently soliciting formal quotations for: {title}.\n\nPlease provide your detailed quote, lead time, and SLA terms at your earliest convenience.\n\nBest regards,\nProcurement Department"
            }

        dispatched_logs = []
        updated_vendors = []
        for v in vendors:
            vendor_name = v.get("vendor_name", "Vendor")
            email_body = rfq_template["body_template"].replace("{vendor_name}", vendor_name)

            updated_v = dict(v)
            updated_v["contact_status"] = "RFQ_SENT"
            updated_vendors.append(updated_v)

            dispatched_logs.append({
                "vendor_name": vendor_name,
                "vendor_email": v.get("vendor_email"),
                "subject": rfq_template["subject"],
                "status": "SENT",
                "message_preview": email_body[:150] + "..."
            })

        return {
            "status": "success",
            "subagent": "rfq_outreach",
            "rfq_template": rfq_template,
            "dispatched_vendors": updated_vendors,
            "dispatch_logs": dispatched_logs
        }
