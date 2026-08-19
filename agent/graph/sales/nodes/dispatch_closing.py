"""
Stage 6: Dispatch & Closing Node.
Executes cold email outreach via Gmail API adapter, logs prospects to CRM database, and updates deal stages.
"""
import json
import logging
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from tool_gateway.adapters.gmail_adapter import execute_gmail_tool
from tool_gateway.credentials_manager import fetch_tool_credentials
from services.db_client import execute_db_query

logger = logging.getLogger(__name__)


def _normalize_uuid(tenant_id: str) -> str:
    if not tenant_id or len(tenant_id) < 30 or tenant_id in ("default_tenant", "sales_sdr"):
        return "00000000-0000-0000-0000-000000000000"
    return tenant_id


async def dispatch_closing_node(state: SalesAgentState) -> Dict[str, Any]:
    raw_tenant_id = state.get("tenant_id", "")
    tenant_id = _normalize_uuid(raw_tenant_id)
    outreach_batch = state.get("outreach_batch", [])
    logs = list(state.get("logs", []))

    if not outreach_batch:
        # Single prospect fallback compatibility
        contact = state.get("discovered_contact") or {}
        outreach = state.get("generated_outreach") or {}
        deliverability = state.get("deliverability_result") or {}
        if contact:
            outreach_batch = [{
                "company_name": contact.get("company_name", "Enterprise Client"),
                "domain": contact.get("domain", "enterprise.com"),
                "contact_name": contact.get("contact_name", "Executive"),
                "contact_title": contact.get("contact_title", "Decision Maker"),
                "contact_email": contact.get("contact_email", "prospect@enterprise.com"),
                "apollo_person_id": contact.get("apollo_person_id", "APOLLO-1"),
                "deliverability_status": deliverability.get("status", "VALID"),
                "icp_score": state.get("icp_score", 90.0),
                "subject": outreach.get("subject", "AI Workflow Platform Partnership"),
                "body": outreach.get("body", "Outreach proposal dispatched."),
                "quote_details": state.get("quote_details", {}),
                "scraped_text": "",
            }]

    # Fetch decrypted tenant credentials for Gmail tool
    credentials = {}
    try:
        credentials = await fetch_tool_credentials(raw_tenant_id, tool_id="gmail")
        if not credentials or not credentials.get("access_token"):
            credentials = await fetch_tool_credentials(tenant_id, tool_id="gmail")
    except Exception as e:
        logger.warning(f"Could not fetch Gmail credentials: {e}")

    processed_prospects: List[Dict[str, Any]] = []
    sent_count = 0
    failed_or_skipped_count = 0

    for item in outreach_batch:
        contact_email = item.get("contact_email")
        subject = item.get("subject", "Partnership Proposal")
        body = item.get("body", "Connecting regarding autonomous workflows.")
        company_name = item.get("company_name", "Enterprise Client")
        domain = item.get("domain", "enterprise.com")

        gmail_message_id = "NOT_SENT"
        deal_stage = "DISCOVERED"

        try:
            gmail_res = await execute_gmail_tool(
                tool_name="send_email",
                arguments={"to": contact_email, "subject": subject, "body": body},
                credentials=credentials
            )
            # Only mark as OUTREACH_SENT if Gmail API explicitly returns success
            if ("Successfully sent" in gmail_res or "Message ID" in gmail_res) and "Error" not in gmail_res:
                deal_stage = "OUTREACH_SENT"
                sent_count += 1
                if "Message ID: " in gmail_res:
                    msg_id_part = gmail_res.split("Message ID: ")[-1].strip()
                    gmail_message_id = f"MSG-GMAIL-{msg_id_part}"
                else:
                    gmail_message_id = "MSG-GMAIL-" + str(hash(contact_email))[-8:]
            else:
                failed_or_skipped_count += 1
                logger.info(f"Gmail dispatch note for {contact_email}: {gmail_res}")
        except Exception as e:
            failed_or_skipped_count += 1
            logger.warning(f"Gmail adapter dispatch exception for {contact_email}: {e}")

        # Persist Prospect & Deal into PostgreSQL Database with accurate deal stage
        try:
            query = """
            INSERT INTO sales_prospects (
              tenant_id, company_name, domain, contact_name, contact_email, contact_title,
              icp_score, deliverability_status, scraped_context, outreach_subject, outreach_body,
              deal_stage, quote_details, apollo_person_id, gmail_message_id, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, NOW(), NOW()
            );
            """
            await execute_db_query(query, [
                tenant_id,
                company_name,
                domain,
                item.get("contact_name", "Decision Maker"),
                contact_email,
                item.get("contact_title", "Executive"),
                item.get("icp_score", 90.0),
                item.get("deliverability_status", "VALID"),
                item.get("scraped_text", "")[:1000],
                subject,
                body,
                deal_stage,
                json.dumps(item.get("quote_details", {})),
                item.get("apollo_person_id", "APOLLO-1"),
                gmail_message_id,
            ])
            item["logged_to_db"] = True
        except Exception as e:
            logger.warning(f"Failed to insert sales_prospects record: {e}")
            item["logged_to_db"] = False

        item["gmail_message_id"] = gmail_message_id
        item["deal_stage"] = deal_stage
        processed_prospects.append(item)

    if sent_count > 0:
        log_detail = f"Dispatched outreach to {sent_count}/{len(processed_prospects)} prospects via Gmail API. Stage: OUTREACH_SENT."
    else:
        log_detail = f"Processed {len(processed_prospects)} prospects. Drafted outreach saved to CRM with stage DISCOVERED (Gmail OAuth not connected or API call unauthenticated)."

    logs.append({
        "stage": "Stage 6: Dispatch & Closing",
        "status": "COMPLETED",
        "details": log_detail
    })

    first_contact = processed_prospects[0] if processed_prospects else {}
    answer_summary = f"AI Sales SDR Agent campaign complete! Processed {len(processed_prospects)} prospect profiles.\n\n" \
                     f"• Primary Contact: {first_contact.get('contact_name')} ({first_contact.get('company_name')})\n" \
                     f"• Contact Email: {first_contact.get('contact_email')}\n" \
                     f"• ICP Score: {first_contact.get('icp_score')}/100\n" \
                     f"• Deal Stage: {first_contact.get('deal_stage')}\n" \
                     f"• Gmail Sent: {sent_count}/{len(processed_prospects)} messages successfully transmitted"

    return {
        "processed_count": len(processed_prospects),
        "outreach_sent": sent_count > 0,
        "gmail_message_id": first_contact.get("gmail_message_id"),
        "discovered_contact": first_contact,
        "icp_score": first_contact.get("icp_score", 90.0),
        "deal_stage": first_contact.get("deal_stage", "DISCOVERED"),
        "answer": answer_summary,
        "logs": logs,
    }
