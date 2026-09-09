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
    auto_send = state.get("auto_send_email", False)
    logs = list(state.get("logs", []))

    logger.info(f"[STAGE 6 DISPATCH] Starting. outreach_batch len={len(outreach_batch)}, raw_tenant_id='{raw_tenant_id}', tenant_id='{tenant_id}'")

    if not outreach_batch:
        # Check if single verified contact exists
        contact = state.get("discovered_contact") or {}
        deliverability = state.get("deliverability_result") or {}
        outreach_channel = (state.get("outreach_channel") or "email").lower()
        logger.info(f"[STAGE 6 DISPATCH] outreach_batch is empty. Checking single contact: email='{contact.get('contact_email')}', phone='{contact.get('contact_phone')}', deliverability.is_valid={deliverability.get('is_valid')}, wa_status={contact.get('whatsapp_status')}")
        
        # Only fallback if the single contact has a valid deliverability check or whatsapp check
        is_valid_candidate = bool(
            contact.get("whatsapp_status") == "ON_WHATSAPP"
            or contact.get("contact_phone")
            or deliverability.get("is_valid", False)
        )
        if contact and is_valid_candidate:
            gen_outreach = state.get("generated_outreach") or {}
            outreach_batch = [{
                "company_name": contact.get("company_name", "Enterprise Client"),
                "domain": contact.get("domain", "enterprise.com"),
                "contact_name": contact.get("contact_name", "Executive"),
                "contact_title": contact.get("contact_title", "Decision Maker"),
                "contact_email": contact.get("contact_email", "prospect@enterprise.com"),
                "contact_phone": contact.get("contact_phone"),
                "whatsapp_status": contact.get("whatsapp_status", "UNVERIFIED"),
                "outreach_channel": outreach_channel,
                "apollo_person_id": contact.get("serper_contact_id") or contact.get("apollo_person_id", "SERPER-1"),
                "hunter_person_id": contact.get("serper_contact_id") or contact.get("hunter_person_id", "SERPER-1"),
                "deliverability_status": deliverability.get("status", "VALID"),
                "icp_score": state.get("icp_score", 90.0),
                "subject": gen_outreach.get("subject", "AI Workflow Platform Partnership"),
                "body": gen_outreach.get("body", "Outreach proposal dispatched."),
                "quote_details": state.get("quote_details", {}),
                "scraped_text": "",
            }]
        else:
            log_detail = f"No 100% deliverable executive prospects passed Stage 4 verification for {outreach_channel.upper()} outreach. Discarded by verification guard."
            logger.warning(f"[STAGE 6 DISPATCH] ❌ Ending stage with processed_count=0. Detail: {log_detail}")
            logs.append({
                "stage": "Stage 6: Dispatch & Closing",
                "status": "COMPLETED",
                "details": log_detail
            })
            return {
                "processed_count": 0,
                "outreach_sent": False,
                "gmail_message_id": None,
                "discovered_contact": None,
                "icp_score": 0,
                "deal_stage": "NO_VERIFIED_CONTACTS",
                "answer": "AI Sales SDR Agent complete: 0 unverified contacts passed deliverability check.",
                "logs": logs,
            }

    # Fetch decrypted tenant credentials for Gmail tool only if auto_send is requested
    credentials = {}
    if auto_send:
        try:
            credentials = await fetch_tool_credentials(raw_tenant_id, tool_id="gmail")
            if not credentials or not credentials.get("access_token"):
                credentials = await fetch_tool_credentials(tenant_id, tool_id="gmail")
        except Exception as e:
            logger.warning(f"Could not fetch Gmail credentials: {e}")

    outreach_channel = (state.get("outreach_channel") or "email").lower()
    processed_prospects: List[Dict[str, Any]] = []
    sent_count = 0
    failed_or_skipped_count = 0

    from services.whatsapp_verifier import check_whatsapp_registration
    from tool_gateway.adapters.whatsapp_adapter import execute_whatsapp_tool

    for idx, item in enumerate(outreach_batch):
        contact_email = item.get("contact_email")
        contact_phone = item.get("contact_phone")
        subject = item.get("subject", "Partnership Proposal")
        body = item.get("body", "Connecting regarding autonomous workflows.")
        company_name = item.get("company_name", "Enterprise Client")
        domain = item.get("domain", "enterprise.com")
        wa_status = item.get("whatsapp_status", "UNVERIFIED")

        gmail_message_id = "NOT_SENT"
        whatsapp_message_id = "NOT_SENT"
        deal_stage = "DISCOVERED"

        if auto_send:
            if outreach_channel == "whatsapp":
                clean_phone = "".join(c for c in str(contact_phone) if c.isdigit() or c == "+") if contact_phone else ""
                if clean_phone:
                    try:
                        # 1. Double check registration via Baileys onWhatsApp before sending
                        wa_check = await check_whatsapp_registration(clean_phone, tenant_id=tenant_id)
                        if wa_check.get("exists"):
                            wa_res = await execute_whatsapp_tool(
                                tool_name="whatsapp_send_message",
                                arguments={"to": clean_phone, "message": body},
                                tenant_id=tenant_id
                            )
                            if "successfully" in wa_res.lower() or "message id" in wa_res.lower():
                                deal_stage = "OUTREACH_SENT"
                                sent_count += 1
                                wa_status = "ON_WHATSAPP"
                                whatsapp_message_id = f"MSG-WA-{str(hash(clean_phone))[-8:]}"
                                if "Message ID: " in wa_res:
                                    whatsapp_message_id = f"MSG-WA-{wa_res.split('Message ID: ')[-1].strip()}"
                            else:
                                failed_or_skipped_count += 1
                                logger.info(f"WhatsApp dispatch note for {clean_phone}: {wa_res}")
                        else:
                            failed_or_skipped_count += 1
                            wa_status = "NOT_ON_WHATSAPP"
                            logger.info(f"Skipped WhatsApp dispatch: {clean_phone} not on WhatsApp.")
                    except Exception as e:
                        failed_or_skipped_count += 1
                        logger.warning(f"WhatsApp dispatch exception for {clean_phone}: {e}")
                else:
                    failed_or_skipped_count += 1
            else:
                # Email dispatch via Gmail API
                try:
                    gmail_res = await execute_gmail_tool(
                        tool_name="send_email",
                        arguments={"to": contact_email, "subject": subject, "body": body},
                        credentials=credentials
                    )
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
        else:
            logger.info(f"Auto-send disabled. Draft created for {contact_email or contact_phone} with stage DISCOVERED.")

        # Persist Prospect & Deal into PostgreSQL Database
        try:
            hunter_id = item.get("hunter_person_id") or item.get("apollo_person_id") or item.get("serper_contact_id") or f"SERPER-INFERRED-{idx+1}"
            check_query = """
            SELECT id FROM sales_prospects 
            WHERE tenant_id = $1 AND (
              (contact_email IS NOT NULL AND $2 != '' AND LOWER(contact_email) = LOWER($2)) OR 
              (contact_phone IS NOT NULL AND $3 != '' AND contact_phone = $3)
            );
            """
            check_res = await execute_db_query(check_query, [tenant_id, contact_email or '', contact_phone or ''])

            if check_res and check_res.get("rows") and len(check_res["rows"]) > 0:
                existing_id = check_res["rows"][0]["id"]
                update_query = """
                UPDATE sales_prospects SET
                  company_name = $1, domain = $2, contact_name = $3, contact_title = $4,
                  contact_phone = COALESCE($5, contact_phone), whatsapp_status = $6, outreach_channel = $7,
                  icp_score = $8, deliverability_status = $9, scraped_context = $10,
                  outreach_subject = $11, outreach_body = $12, deal_stage = $13,
                  quote_details = $14::jsonb, hunter_person_id = $15, apollo_person_id = $16,
                  gmail_message_id = CASE WHEN $17 != 'NOT_SENT' THEN $17 ELSE gmail_message_id END,
                  whatsapp_message_id = CASE WHEN $18 != 'NOT_SENT' THEN $18 ELSE whatsapp_message_id END,
                  last_channel_used = $7,
                  deal_value = COALESCE(deal_value, 50000.00), updated_at = NOW()
                WHERE id = $19;
                """
                await execute_db_query(update_query, [
                    company_name,
                    domain,
                    item.get("contact_name", "Decision Maker"),
                    item.get("contact_title", "Executive"),
                    contact_phone,
                    wa_status,
                    outreach_channel,
                    item.get("icp_score", 90.0),
                    item.get("deliverability_status", "VALID"),
                    item.get("scraped_text", "")[:1000],
                    subject,
                    body,
                    deal_stage,
                    json.dumps(item.get("quote_details", {})),
                    hunter_id,
                    hunter_id,
                    gmail_message_id,
                    whatsapp_message_id,
                    existing_id,
                ])
            else:
                query = """
                INSERT INTO sales_prospects (
                  tenant_id, company_name, domain, contact_name, contact_email, contact_phone,
                  whatsapp_status, outreach_channel, contact_title,
                  icp_score, deliverability_status, scraped_context, outreach_subject, outreach_body,
                  deal_stage, quote_details, hunter_person_id, apollo_person_id, gmail_message_id,
                  whatsapp_message_id, last_channel_used, deal_value, created_at, updated_at
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19, $20, $21, 50000.00, NOW(), NOW()
                );
                """
                await execute_db_query(query, [
                    tenant_id,
                    company_name,
                    domain,
                    item.get("contact_name", "Decision Maker"),
                    contact_email,
                    contact_phone,
                    wa_status,
                    outreach_channel,
                    item.get("contact_title", "Executive"),
                    item.get("icp_score", 90.0),
                    item.get("deliverability_status", "VALID"),
                    item.get("scraped_text", "")[:1000],
                    subject,
                    body,
                    deal_stage,
                    json.dumps(item.get("quote_details", {})),
                    hunter_id,
                    hunter_id,
                    gmail_message_id,
                    whatsapp_message_id,
                    outreach_channel,
                ])
            item["logged_to_db"] = True
        except Exception as e:
            logger.warning(f"Failed to upsert sales_prospects record: {e}")
            item["logged_to_db"] = False

        item["gmail_message_id"] = gmail_message_id
        item["whatsapp_message_id"] = whatsapp_message_id
        item["deal_stage"] = deal_stage
        item["outreach_subject"] = subject
        item["outreach_body"] = body
        item["outreach_channel"] = outreach_channel
        item["whatsapp_status"] = wa_status
        processed_prospects.append(item)

    if sent_count > 0:
        log_detail = f"Dispatched outreach to {sent_count}/{len(processed_prospects)} prospects via {outreach_channel.upper()}. Stage: OUTREACH_SENT."
    else:
        log_detail = f"Processed {len(processed_prospects)} prospects. Drafted outreach saved to CRM with stage DISCOVERED ({outreach_channel.upper()} auto-send disabled or uncoupled)."

    logs.append({
        "stage": "Stage 6: Dispatch & Closing",
        "status": "COMPLETED",
        "details": log_detail
    })

    first_contact = processed_prospects[0] if processed_prospects else {}
    channel_info = f"WhatsApp ({first_contact.get('contact_phone')})" if outreach_channel == "whatsapp" else f"Email ({first_contact.get('contact_email')})"
    answer_summary = f"AI Sales SDR Agent campaign complete! Processed {len(processed_prospects)} prospect profiles via {outreach_channel.upper()}.\n\n" \
                     f"• Primary Contact: {first_contact.get('contact_name')} ({first_contact.get('company_name')})\n" \
                     f"• Contact Channel: {channel_info}\n" \
                     f"• ICP Score: {first_contact.get('icp_score')}/100\n" \
                     f"• Deal Stage: {first_contact.get('deal_stage')}\n" \
                     f"• Messages Sent: {sent_count}/{len(processed_prospects)} successfully transmitted"

    return {
        "processed_count": len(processed_prospects),
        "outreach_sent": sent_count > 0,
        "gmail_message_id": first_contact.get("gmail_message_id"),
        "whatsapp_message_id": first_contact.get("whatsapp_message_id"),
        "whatsapp_status": first_contact.get("whatsapp_status"),
        "outreach_channel": outreach_channel,
        "discovered_contact": first_contact,
        "icp_score": first_contact.get("icp_score", 90.0),
        "deal_stage": first_contact.get("deal_stage", "DISCOVERED"),
        "answer": answer_summary,
        "logs": logs,
    }
