"""
Stage 5: WhatsApp Dispatch & CRM Persistence Node.
Dispatches outreach messages via the backend WhatsApp MCP service (if auto_send_whatsapp is True),
persists verified WhatsApp prospects into the PostgreSQL CRM database (sales_prospects),
and updates deal stages.
Completely eliminates all Gmail API and email sending dependencies.
"""
import json
import logging
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from tool_gateway.adapters.whatsapp_adapter import execute_whatsapp_tool
from services.db_client import execute_db_query

logger = logging.getLogger(__name__)


def _normalize_uuid(tenant_id: str) -> str:
    if not tenant_id or len(tenant_id) < 30 or tenant_id in ("default_tenant", "sales_sdr"):
        return "00000000-0000-0000-0000-000000000000"
    return tenant_id


async def whatsapp_dispatch_node(state: SalesAgentState) -> Dict[str, Any]:
    raw_tenant_id = state.get("tenant_id", "")
    tenant_id = _normalize_uuid(raw_tenant_id)
    outreach_batch = list(state.get("outreach_batch", []))
    auto_send = bool(state.get("auto_send_whatsapp", False))
    logs = list(state.get("logs", []))

    logger.info(
        f"[STAGE 5: WHATSAPP DISPATCH] Starting CRM persistence and dispatch. "
        f"Batch count: {len(outreach_batch)}, auto_send_whatsapp: {auto_send}"
    )

    if not outreach_batch:
        log_detail = "No verified ON_WHATSAPP prospects were available to process or dispatch."
        logger.warning(f"[STAGE 5: WHATSAPP DISPATCH] ❌ Ending stage with processed_count=0.")
        logs.append({
            "stage": "Stage 5: WhatsApp Dispatch & CRM Persistence",
            "status": "COMPLETED",
            "details": log_detail,
        })
        return {
            "processed_count": 0,
            "outreach_sent": False,
            "whatsapp_message_id": None,
            "discovered_contact": None,
            "icp_score": 0.0,
            "deal_stage": "NO_VERIFIED_CONTACTS",
            "answer": "AI WhatsApp SDR complete: 0 prospects verified on WhatsApp.",
            "logs": logs,
        }

    processed_prospects: List[Dict[str, Any]] = []
    sent_count = 0

    for idx, item in enumerate(outreach_batch):
        company_name = item.get("company_name", "Enterprise Client")
        domain = item.get("domain", "enterprise.com")
        contact_name = item.get("contact_name", "Decision Maker")
        contact_phone = item.get("contact_phone")
        wa_status = item.get("whatsapp_status", "ON_WHATSAPP")
        body = item.get("body", "")
        subject = item.get("subject", f"Partnership Inquiry — {company_name}")
        icp_score = item.get("icp_score", 90.0)
        quote_details = item.get("quote_details") or {}

        deal_stage = "DISCOVERED"
        wa_message_id = None
        was_sent = False

        # Attempt auto-dispatch if enabled
        if auto_send and contact_phone and wa_status == "ON_WHATSAPP":
            try:
                wa_res = await execute_whatsapp_tool(
                    tool_name="whatsapp_send_message",
                    arguments={"recipient": contact_phone, "message": body},
                    tenant_id=raw_tenant_id or tenant_id,
                )
                if "Error" not in wa_res and ("Sent message" in wa_res or "messageId" in wa_res or "successfully" in wa_res.lower()):
                    was_sent = True
                    deal_stage = "OUTREACH_SENT"
                    sent_count += 1
                    wa_message_id = "MSG-WA-" + str(hash(contact_phone))[-8:]
                    if "messageId: " in wa_res:
                        wa_message_id = f"MSG-WA-{wa_res.split('messageId: ')[-1].split()[0].strip()}"
                    logger.info(f"[STAGE 5 DISPATCH] ✅ Dispatched WhatsApp message to {contact_phone} ({company_name})")
                else:
                    logger.warning(f"[STAGE 5 DISPATCH] ⚠️ WhatsApp auto-send notice for {contact_phone}: {wa_res}")
            except Exception as e:
                logger.error(f"[STAGE 5 DISPATCH] Failed to send WhatsApp message to {contact_phone}: {e}")

        # Persist prospect into PostgreSQL CRM
        try:
            upsert_query = """
            INSERT INTO sales_prospects (
                tenant_id, company_name, domain, contact_name, contact_phone,
                contact_title, icp_score, deliverability_status, whatsapp_status,
                outreach_channel, scraped_context, outreach_subject, outreach_body,
                deal_stage, quote_details, whatsapp_message_id, last_channel_used,
                created_at, updated_at
            )
            VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
            )
            ON CONFLICT (id) DO NOTHING;
            """
            await execute_db_query(
                upsert_query,
                [
                    tenant_id,
                    company_name,
                    domain,
                    contact_name,
                    contact_phone,
                    item.get("contact_title", "Owner / General Manager"),
                    float(icp_score),
                    "VALID",
                    wa_status,
                    "whatsapp",
                    item.get("address", ""),
                    subject,
                    body,
                    deal_stage,
                    json.dumps(quote_details),
                    wa_message_id,
                    "whatsapp",
                ]
            )
        except Exception as db_err:
            logger.warning(f"[STAGE 5 DISPATCH] CRM DB persistence note: {db_err}")

        processed_item = dict(item)
        processed_item["deal_stage"] = deal_stage
        processed_item["outreach_sent"] = was_sent
        processed_item["whatsapp_message_id"] = wa_message_id
        processed_prospects.append(processed_item)

    if auto_send:
        details_msg = f"Processed and saved {len(processed_prospects)} verified WhatsApp prospects to CRM. Successfully dispatched {sent_count} live WhatsApp outreach messages."
    else:
        details_msg = f"Discovered and qualified {len(processed_prospects)} verified ON_WHATSAPP prospects. Ready for 1-click WhatsApp sending in the dashboard."

    logs.append({
        "stage": "Stage 5: WhatsApp Dispatch & CRM Persistence",
        "status": "COMPLETED",
        "details": details_msg,
    })

    top_prospect = processed_prospects[0] if processed_prospects else None
    first_company = top_prospect.get("company_name") if top_prospect else "Prospect"
    first_phone = top_prospect.get("contact_phone") if top_prospect else ""

    summary_answer = (
        f"AI WhatsApp SDR complete: Successfully discovered, Gemini-evaluated, and verified {len(processed_prospects)} "
        f"prospects on WhatsApp. Top lead: {first_company} ({first_phone}). "
        f"Deal stage: {processed_prospects[0]['deal_stage'] if processed_prospects else 'DISCOVERED'}."
    )

    return {
        "processed_count": len(processed_prospects),
        "outreach_sent": bool(sent_count > 0),
        "whatsapp_message_id": processed_prospects[0].get("whatsapp_message_id") if processed_prospects else None,
        "whatsapp_status": "ON_WHATSAPP",
        "outreach_channel": "whatsapp",
        "deal_stage": processed_prospects[0]["deal_stage"] if processed_prospects else "DISCOVERED",
        "discovered_contact": top_prospect,
        "outreach_batch": processed_prospects,
        "answer": summary_answer,
        "logs": logs,
    }
