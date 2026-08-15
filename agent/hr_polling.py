"""
HR Email Polling Engine — Scans Gmail for job applications,
classifies them against open roles, and manages the Talent Pool.
Also monitors project pacing and sends reminder emails.

Runs as a separate async loop alongside the workflow polling engine.
"""
import asyncio
import json
import base64
import re
import traceback
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

import httpx
from config import settings
from services.llm_gateway import get_llm
from tool_gateway.centralized_gateway import execute_mcp_tool
from tool_gateway.credentials_manager import fetch_tool_credentials

HR_POLLING_INTERVAL_SECONDS = 60
PACING_CHECK_INTERVAL = 3  # Every 3rd cycle

_HEADERS = lambda: {"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN}


async def _backend_get(path: str) -> dict:
    """HTTP GET to the Node.js backend internal routes."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(
            f"{settings.BACKEND_URL}{path}",
            headers=_HEADERS(),
        )
        res.raise_for_status()
        return res.json()


async def _backend_post(path: str, data: dict) -> dict:
    """HTTP POST to the Node.js backend internal routes."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            f"{settings.BACKEND_URL}{path}",
            json=data,
            headers=_HEADERS(),
        )
        res.raise_for_status()
        return res.json()


async def _backend_patch(path: str, data: dict) -> dict:
    """HTTP PATCH to the Node.js backend internal routes."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.patch(
            f"{settings.BACKEND_URL}{path}",
            json=data,
            headers=_HEADERS(),
        )
        res.raise_for_status()
        return res.json()


def _extract_email_address(from_header: str) -> str:
    """Extract clean email address from 'Name <email>' format."""
    match = re.search(r'<([^>]+)>', from_header)
    if match:
        return match.group(1)
    return from_header.strip()


def _extract_name_from_header(from_header: str) -> str:
    """Extract name from 'Name <email>' format."""
    match = re.search(r'^([^<]+)<', from_header)
    if match:
        return match.group(1).strip().strip('"')
    return from_header.split('@')[0]


async def _get_email_details(tenant_id: str, message_id: str) -> Optional[dict]:
    """Fetch full email details including body and attachment info."""
    try:
        # Read full body
        body_response = await execute_mcp_tool(
            tenant_id=tenant_id,
            agent_instance_id="workflow-builder",
            tool_name="gmail",
            arguments={"action": "read_full", "id": message_id}
        )
        
        if "Error" in body_response:
            print(f"[HR POLL] Failed to read email {message_id}: {body_response}")
            return None
        
        # Parse the response
        lines = body_response.split('\n')
        subject = ""
        sender = ""
        date_str = ""
        body_start = 0
        
        for i, line in enumerate(lines):
            if line.startswith("Subject: "):
                subject = line[9:]
            elif line.startswith("From: "):
                sender = line[6:]
            elif line.startswith("Date: "):
                date_str = line[6:]
            elif line == "":
                body_start = i + 1
                break
        
        body = '\n'.join(lines[body_start:]) if body_start > 0 else ""
        
        # Get attachments
        attachments = []
        try:
            att_response = await execute_mcp_tool(
                tenant_id=tenant_id,
                agent_instance_id="workflow-builder",
                tool_name="gmail",
                arguments={"action": "attachment", "id": message_id}
            )
            
            if not att_response.startswith("Error") and not att_response.startswith("No attachments"):
                att_data = json.loads(att_response)
                attachments = att_data.get("attachments", [])
        except Exception:
            pass  # Attachments are optional
        
        return {
            "message_id": message_id,
            "subject": subject,
            "sender": sender,
            "sender_email": _extract_email_address(sender),
            "sender_name": _extract_name_from_header(sender),
            "date": date_str,
            "body": body,
            "attachments": attachments,
        }
    except Exception as e:
        print(f"[HR POLL] Error getting email details for {message_id}: {e}")
        return None


def _decode_attachment_text(attachment: dict) -> str:
    """Attempt to decode text from an attachment based on its MIME type."""
    mime = attachment.get("mimeType", "").lower()
    data_b64 = attachment.get("data", "")
    
    if not data_b64:
        return ""
    
    try:
        # Decode base64url to bytes
        raw_bytes = base64.urlsafe_b64decode(data_b64 + "==")  # Pad if needed
        
        if "text/plain" in mime or "text/csv" in mime:
            return raw_bytes.decode("utf-8", errors="replace")
        
        # For PDF/DOCX, we'd need extraction libraries
        # Return a marker so the calling code knows it's binary
        return f"[BINARY_ATTACHMENT:{attachment.get('filename', 'unknown')}:{len(raw_bytes)} bytes]"
    except Exception:
        return ""


def _extract_links_from_text(text: str) -> List[str]:
    """Extract URLs from email body text that might be resume links."""
    url_pattern = r'https?://[^\s<>"]+(?:\.pdf|\.docx|drive\.google\.com|dropbox\.com|linkedin\.com)[^\s<>"]*'
    return re.findall(url_pattern, text, re.IGNORECASE)


async def _classify_application(
    email_details: dict,
    open_roles: List[dict],
    resume_text: str = ""
) -> dict:
    """Use LLM to classify which open role (if any) this email application is for."""
    llm = get_llm()
    
    roles_summary = "\n".join([
        f"- Role ID: {r['id']} | Title: {r['title']} | Description: {r['description'][:200]}..."
        for r in open_roles
    ]) if open_roles else "No open roles currently available."
    
    prompt = f"""You are an HR email classifier. Analyze this incoming email and determine:
1. Is this a job application email? (someone applying for a position)
2. If yes, which open role does it best match?

Email Details:
- Subject: {email_details.get('subject', '')}
- From: {email_details.get('sender', '')}
- Body Preview: {email_details.get('body', '')[:1500]}

Resume/CV Text (if available):
{resume_text[:2000] if resume_text else 'No resume text extracted.'}

Currently Open Roles:
{roles_summary}

Respond with ONLY a valid JSON object:
{{
  "is_job_application": true/false,
  "matched_role_id": "uuid-of-matched-role" or null,
  "confidence": 0.0-1.0,
  "applicant_name": "extracted name" or "Unknown",
  "desired_role": "what role they seem to be applying for" or null,
  "reasoning": "brief explanation"
}}

Rules:
- If it is NOT a job application (e.g. spam, newsletter, regular business email), set is_job_application to false.
- If it IS an application but no open role matches, set matched_role_id to null.
- Extract the applicant's name from the email signature, body, or resume if possible.
- Do not include markdown backticks in your response.
"""
    
    try:
        response = await llm.ainvoke(prompt)
        content = response.content.strip()
        if content.startswith("```json"):
            content = content[7:-3].strip()
        elif content.startswith("```"):
            content = content[3:-3].strip()
        
        return json.loads(content)
    except Exception as e:
        print(f"[HR POLL] Classification error: {e}")
        return {"is_job_application": False, "reasoning": f"Classification failed: {str(e)}"}


async def _send_ack_email(
    tenant_id: str,
    to_email: str,
    applicant_name: str,
    role_title: Optional[str] = None,
    matched: bool = True
) -> bool:
    """Send an acknowledgement email to the applicant."""
    llm = get_llm()
    
    if matched:
        context = f"The applicant applied for the '{role_title}' position and their application has been received."
        instruction = "Write a professional acknowledgement email confirming their application was received for the specified position. Mention that if they are shortlisted, they will be contacted about the next steps in the process."
    else:
        context = f"The applicant applied for a role that is not currently open."
        instruction = "Write a professional email thanking them for their interest, informing them that the role they applied for is not currently open, but assuring them their application has been saved and they will be informed when relevant positions open in the future."
    
    prompt = f"""You are an HR Assistant for a professional company. Draft an email.

Applicant Name: {applicant_name}
Context: {context}

{instruction}

Output a JSON object with:
1. "subject": The email subject line.
2. "body": The plain text email body.

Return ONLY valid JSON. No markdown backticks.
"""
    
    try:
        response = await llm.ainvoke(prompt)
        content = response.content.strip()
        if content.startswith("```json"):
            content = content[7:-3].strip()
        elif content.startswith("```"):
            content = content[3:-3].strip()
        
        parsed = json.loads(content)
        
        result = await execute_mcp_tool(
            tenant_id=tenant_id,
            agent_instance_id="workflow-builder",
            tool_name="gmail",
            arguments={
                "action": "send",
                "to": to_email,
                "subject": parsed.get("subject", "Application Received"),
                "body": parsed.get("body", f"Dear {applicant_name},\n\nThank you for your application. We have received it and will be in touch.\n\nBest regards,\nHR Team"),
            }
        )
        
        if "Error" not in result:
            print(f"[HR POLL] Ack email sent to {to_email}")
            return True
        else:
            print(f"[HR POLL] Failed to send ack email: {result}")
            return False
    except Exception as e:
        print(f"[HR POLL] Error sending ack email to {to_email}: {e}")
        return False


async def poll_hr_mailbox(tenant_id: str):
    """
    Poll Gmail for new job application emails for a given tenant.
    Classifies each email and stores in the appropriate category.
    """
    print(f"[HR POLL] Scanning mailbox for tenant {str(tenant_id)[:8]}...")
    
    try:
        # 1. Fetch open roles for this tenant
        roles_data = await _backend_get(f"/internal/hr/open-roles/{tenant_id}")
        open_roles = roles_data.get("openRoles", [])
        
        # 2. Fetch polling state (processed message IDs)
        state_data = await _backend_get(f"/internal/hr/polling-state/{tenant_id}")
        state = state_data.get("state", {})
        processed_ids = set()
        raw_ids = state.get("last_processed_message_ids", [])
        if isinstance(raw_ids, str):
            try:
                raw_ids = json.loads(raw_ids)
            except:
                raw_ids = []
        processed_ids = set(raw_ids)
        
        # 3. Search Gmail for application emails
        # Combine search queries from all open roles, plus a general one
        search_queries = set()
        for role in open_roles:
            sq = role.get("search_query", "")
            if sq:
                search_queries.add(sq)
        
        if not search_queries:
            search_queries.add("subject:job application OR subject:application for OR subject:resume OR subject:CV")
        
        all_message_ids = set()
        for sq in search_queries:
            try:
                result = await execute_mcp_tool(
                    tenant_id=tenant_id,
                    agent_instance_id="workflow-builder",
                    tool_name="gmail",
                    arguments={"action": "search", "q": sq, "limit": 20}
                )
                
                if "Error" in result or "No messages" in result:
                    continue
                
                # Parse message IDs from the response
                # The gmail adapter returns "Found N messages: [{'id': '...', 'threadId': '...'}, ...]"
                import ast
                try:
                    # Extract the list portion
                    list_start = result.find('[')
                    if list_start >= 0:
                        list_str = result[list_start:]
                        messages = ast.literal_eval(list_str)
                        for msg in messages:
                            if isinstance(msg, dict) and 'id' in msg:
                                all_message_ids.add(msg['id'])
                except Exception:
                    pass
            except Exception as e:
                print(f"[HR POLL] Search error for query '{sq}': {e}")
        
        # 4. Filter out already-processed messages
        new_message_ids = all_message_ids - processed_ids
        
        if not new_message_ids:
            print(f"[HR POLL] No new messages for tenant {str(tenant_id)[:8]}")
            # Still update the state timestamp
            await _backend_post("/internal/hr/polling-state", {
                "tenant_id": str(tenant_id),
                "processed_ids": list(processed_ids),
            })
            return
        
        print(f"[HR POLL] Found {len(new_message_ids)} new message(s) for tenant {str(tenant_id)[:8]}")
        
        # 5. Process each new message
        for msg_id in new_message_ids:
            try:
                email_details = await _get_email_details(tenant_id, msg_id)
                if not email_details:
                    processed_ids.add(msg_id)
                    continue
                
                # Extract resume text from attachments
                resume_text = ""
                resume_filename = ""
                for att in email_details.get("attachments", []):
                    text = _decode_attachment_text(att)
                    if text and not text.startswith("[BINARY_ATTACHMENT"):
                        resume_text += text + "\n"
                        resume_filename = att.get("filename", "")
                
                # Also look for links in the body
                links = _extract_links_from_text(email_details.get("body", ""))
                if links:
                    resume_text += f"\n\nResume links found: {', '.join(links)}"
                
                # If no text resume, use the body as context
                if not resume_text.strip():
                    resume_text = email_details.get("body", "")
                
                # 6. Classify the email
                classification = await _classify_application(
                    email_details, open_roles, resume_text
                )
                
                if not classification.get("is_job_application", False):
                    print(f"[HR POLL] Email {msg_id} is not a job application, skipping")
                    processed_ids.add(msg_id)
                    continue
                
                applicant_name = classification.get("applicant_name", email_details.get("sender_name", "Unknown"))
                applicant_email = email_details.get("sender_email", "")
                matched_role_id = classification.get("matched_role_id")
                
                if matched_role_id:
                    # Verify the matched role exists and is valid
                    role_exists = any(r["id"] == matched_role_id for r in open_roles)
                    if not role_exists:
                        matched_role_id = None
                
                if matched_role_id:
                    # Store as application under the matched role
                    matched_role = next((r for r in open_roles if r["id"] == matched_role_id), None)
                    
                    app_data = await _backend_post("/internal/hr/applications", {
                        "tenant_id": str(tenant_id),
                        "open_role_id": matched_role_id,
                        "applicant_name": applicant_name,
                        "applicant_email": applicant_email,
                        "email_subject": email_details.get("subject", ""),
                        "email_body": email_details.get("body", "")[:5000],
                        "email_message_id": msg_id,
                        "resume_text": resume_text[:10000],
                        "resume_filename": resume_filename,
                        "source": "email",
                    })
                    
                    print(f"[HR POLL] Application stored for role '{matched_role['title']}' from {applicant_email}")
                    
                    # Send ack email
                    ack_sent = await _send_ack_email(
                        tenant_id=str(tenant_id),
                        to_email=applicant_email,
                        applicant_name=applicant_name,
                        role_title=matched_role["title"],
                        matched=True,
                    )
                    
                    if ack_sent and app_data.get("application", {}).get("id"):
                        await _backend_patch(
                            f"/internal/hr/applications/{app_data['application']['id']}/ack",
                            {}
                        )
                else:
                    # Store in Talent Pool ("Future Prospects")
                    await _backend_post("/internal/hr/talent-pool", {
                        "tenant_id": str(tenant_id),
                        "applicant_name": applicant_name,
                        "applicant_email": applicant_email,
                        "email_subject": email_details.get("subject", ""),
                        "email_body": email_details.get("body", "")[:5000],
                        "email_message_id": msg_id,
                        "resume_text": resume_text[:10000],
                        "resume_filename": resume_filename,
                        "desired_role": classification.get("desired_role", ""),
                    })
                    
                    print(f"[HR POLL] Application from {applicant_email} stored in Talent Pool (no matching role)")
                    
                    # Send ack email (role not open)
                    await _send_ack_email(
                        tenant_id=str(tenant_id),
                        to_email=applicant_email,
                        applicant_name=applicant_name,
                        matched=False,
                    )
                
                processed_ids.add(msg_id)
                
            except Exception as e:
                print(f"[HR POLL] Error processing message {msg_id}: {e}")
                traceback.print_exc()
                processed_ids.add(msg_id)  # Don't re-process failed messages
        
        # 7. Save updated polling state
        await _backend_post("/internal/hr/polling-state", {
            "tenant_id": str(tenant_id),
            "processed_ids": list(processed_ids),
        })
        
    except Exception as e:
        print(f"[HR POLL] Error polling mailbox for tenant {str(tenant_id)[:8]}: {e}")
        traceback.print_exc()


async def check_project_pacing(tenant_id: str):
    """
    Check project pacing for a tenant and send reminder emails
    to team leads of behind-schedule projects.
    """
    print(f"[HR POLL] Checking project pacing for tenant {str(tenant_id)[:8]}...")
    
    try:
        data = await _backend_get(f"/internal/hr/projects-behind-schedule/{tenant_id}")
        behind_projects = data.get("projects", [])
        
        if not behind_projects:
            print(f"[HR POLL] No projects behind schedule for tenant {str(tenant_id)[:8]}")
            return
        
        llm = get_llm()
        
        for project in behind_projects:
            members = project.get("members", [])
            if isinstance(members, str):
                try:
                    members = json.loads(members)
                except:
                    members = []
            
            # Find the team lead, or default to the first member
            lead = next((m for m in members if m.get("role", "").lower() in ["lead", "team lead", "project lead", "manager"]), None)
            if not lead and members:
                lead = members[0]
            
            if not lead or not lead.get("email"):
                continue
            
            # Calculate pacing details
            start_date = datetime.strptime(str(project["start_date"])[:10], "%Y-%m-%d")
            end_date = datetime.strptime(str(project["expected_completion"])[:10], "%Y-%m-%d")
            now = datetime.now()
            total_days = max(1, (end_date - start_date).days)
            elapsed_days = max(0, (now - start_date).days)
            expected_progress = min(100, round((elapsed_days / total_days) * 100))
            current_progress = project.get("current_progress", 0)
            
            prompt = f"""You are an HR Project Manager assistant. Draft a professional but firm reminder email.

Project: {project['name']}
Current Progress: {current_progress}%
Expected Progress: {expected_progress}%
Deadline: {project['expected_completion']}
Team Lead: {lead['name']}
Last Update: {project.get('last_update_summary', 'No recent update')}

The project is behind schedule. Write a concise email to the team lead reminding them to update the project status and take necessary actions to get back on track.

Output a JSON object with:
1. "subject": The email subject line.
2. "body": The plain text email body.

Return ONLY valid JSON. No markdown backticks.
"""
            
            try:
                response = await llm.ainvoke(prompt)
                content = response.content.strip()
                if content.startswith("```json"):
                    content = content[7:-3].strip()
                elif content.startswith("```"):
                    content = content[3:-3].strip()
                
                parsed = json.loads(content)
                
                result = await execute_mcp_tool(
                    tenant_id=str(tenant_id),
                    agent_instance_id="workflow-builder",
                    tool_name="gmail",
                    arguments={
                        "action": "send",
                        "to": lead["email"],
                        "subject": parsed.get("subject", f"Project Reminder: {project['name']}"),
                        "body": parsed.get("body", ""),
                    }
                )
                
                if "Error" not in result:
                    print(f"[HR POLL] Pacing reminder sent for '{project['name']}' to {lead['email']}")
                else:
                    print(f"[HR POLL] Failed to send pacing reminder: {result}")
                    
            except Exception as e:
                print(f"[HR POLL] Error sending pacing reminder for {project['name']}: {e}")
        
    except Exception as e:
        print(f"[HR POLL] Error checking project pacing: {e}")
        traceback.print_exc()


async def poll_all_hr_tenants(cycle_count: int):
    """
    Main HR polling iteration — runs for all tenants with Gmail connected.
    """
    try:
        # Fetch all tenants with Gmail credentials
        data = await _backend_get("/internal/hr/tenants-with-gmail")
        tenants = data.get("tenants", [])
        
        if not tenants:
            return
        
        print(f"[HR POLL] Poll cycle #{cycle_count}: {len(tenants)} tenant(s) with Gmail")
        
        for tenant_id in tenants:
            # Always scan mailbox
            await poll_hr_mailbox(str(tenant_id))
            
            # Check project pacing every PACING_CHECK_INTERVAL cycles
            if cycle_count % PACING_CHECK_INTERVAL == 0:
                await check_project_pacing(str(tenant_id))
        
    except Exception as e:
        print(f"[HR POLL] Engine error: {e}")
        traceback.print_exc()


async def start_hr_polling_engine():
    """Start the infinite HR polling loop."""
    print(f"[HR POLL] Engine started. Polling every {HR_POLLING_INTERVAL_SECONDS}s. Pacing check every {PACING_CHECK_INTERVAL} cycles.")
    cycle_count = 0
    
    # Wait for the app to fully start before first poll
    await asyncio.sleep(5)
    
    while True:
        try:
            cycle_count += 1
            await poll_all_hr_tenants(cycle_count)
        except Exception as e:
            print(f"[HR POLL] Unexpected error in poll loop: {e}")
            traceback.print_exc()
        await asyncio.sleep(HR_POLLING_INTERVAL_SECONDS)
