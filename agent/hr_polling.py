"""
HR Email Polling Engine — Scans Gmail for job applications & project status updates,
classifies them against open roles/projects, and manages the Talent Pool.
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
        
        # For PDF/DOCX, return a marker so calling code knows it's binary
        return f"[BINARY_ATTACHMENT:{attachment.get('filename', 'unknown')}:{len(raw_bytes)} bytes]"
    except Exception:
        return ""


def _extract_links_from_text(text: str) -> List[str]:
    """Extract URLs from email body text that might be resume links."""
    url_pattern = r'https?://[^\s<>"]+(?:\.pdf|\.docx|drive\.google\.com|dropbox\.com|linkedin\.com)[^\s<>"]*'
    return re.findall(url_pattern, text, re.IGNORECASE)


async def _classify_email(
    email_details: dict,
    open_roles: List[dict],
    active_projects: List[dict],
    resume_text: str = ""
) -> dict:
    """Use LLM to classify an incoming email as a job application, project status update, or other."""
    llm = get_llm()
    
    roles_summary = "\n".join([
        f"- Role ID: {r['id']} | Title: {r.get('title') or 'Untitled'} | Description: {(r.get('description') or '')[:150]}..."
        for r in open_roles
    ]) if open_roles else "No open roles currently available."
    
    projects_summary = "\n".join([
        f"- Project ID: {p['id']} | Name: {p.get('name') or 'Unnamed'} | Progress: {p.get('current_progress', 0)}% | Description: {(p.get('description') or '')[:150]}..."
        for p in active_projects
    ]) if active_projects else "No active projects currently."
    
    prompt = f"""You are an HR & Project Operations email classifier. Analyze this incoming email and determine its type.

Email Details:
- Subject: {email_details.get('subject') or ''}
- From: {email_details.get('sender') or ''}
- Body Preview: {(email_details.get('body') or '')[:1500]}

Resume/CV Text (if available):
{resume_text[:1500] if resume_text else 'No resume text extracted.'}

Currently Open Job Roles:
{roles_summary}

Active Company Projects:
{projects_summary}

Determine if this email is:
1. "job_application": An applicant applying for a job, submitting a CV/resume, or following up on a job application.
2. "project_update": A status update, progress report, percentage update, or reply from a team member/lead regarding an active project.
3. "other": General business email, newsletter, spam, or unhandled query.

Respond with ONLY a valid JSON object:
{{
  "email_type": "job_application" | "project_update" | "other",
  
  // If job_application:
  "matched_role_id": "uuid-of-matched-role" or null,
  "applicant_name": "extracted name" or "Unknown",
  "desired_role": "what role they seem to be applying for" or null,

  // If project_update:
  "matched_project_id": "uuid-of-matched-project" or null,
  "project_name": "extracted project name" or null,
  "progress_pct": integer between 0 and 100 if a completion percentage is mentioned or implied, else null,
  "notes": "concise 1-3 sentence summary of the progress or update mentioned in the email",
  "blockers": "any obstacles, blockers, or help needed mentioned in the email, else null",

  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}}

Rules:
- If it is NOT a job application or project update, set email_type to "other".
- If it is a project update but no active project matches, set matched_project_id to null.
- Extract any completion percentage (0-100%) if explicitly stated (e.g. "we are at 60%", "project is half done (50%)", "completed 80%").
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
        return {"email_type": "other", "reasoning": f"Classification failed: {str(e)}"}


async def _send_ack_email(
    tenant_id: str,
    to_email: str,
    applicant_name: str,
    role_title: Optional[str] = None,
    matched: bool = True
) -> bool:
    """Send an acknowledgement email to a job applicant."""
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
    Poll Gmail for new job application & project update emails for a given tenant.
    Classifies each email and handles applications or updates accordingly.
    """
    print(f"[HR POLL] Scanning mailbox for tenant {str(tenant_id)[:8]}...")
    
    try:
        # 1. Fetch open roles and active projects for this tenant
        roles_data = await _backend_get(f"/internal/hr/open-roles/{tenant_id}")
        open_roles = roles_data.get("openRoles", [])

        projects_data = await _backend_get(f"/internal/hr/active-projects/{tenant_id}")
        active_projects = projects_data.get("projects", [])
        
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
        
        # 3. Search Gmail for emails (job applications & project updates)
        search_queries = set()
        for role in open_roles:
            sq = role.get("search_query", "")
            if sq:
                search_queries.add(sq)
        
        # Always include project update search terms as well as general job terms
        search_queries.add("subject:job application OR subject:application for OR subject:resume OR subject:CV OR subject:project OR subject:update OR subject:status OR subject:progress")
        
        all_message_ids = set()
        for sq in search_queries:
            # Restrict search query to incoming inbox messages, excluding sent messages from connected account
            scoped_query = f"in:inbox -from:me ({sq})"
            try:
                result = await execute_mcp_tool(
                    tenant_id=tenant_id,
                    agent_instance_id="workflow-builder",
                    tool_name="gmail",
                    arguments={"action": "search", "q": scoped_query, "limit": 20}
                )
                
                if "Error" in result or "No messages" in result:
                    continue
                
                # Parse message IDs from response
                import ast
                try:
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
                print(f"[HR POLL] Search error for query '{scoped_query}': {e}")
        
        # 4. Filter out already-processed messages
        new_message_ids = all_message_ids - processed_ids
        
        if not new_message_ids:
            print(f"[HR POLL] No new messages for tenant {str(tenant_id)[:8]}")
            await _backend_post("/internal/hr/polling-state", {
                "tenant_id": str(tenant_id),
                "processed_ids": list(processed_ids),
            })
            return
        
        print(f"[HR POLL] Found {len(new_message_ids)} new message(s) for tenant {str(tenant_id)[:8]}")
        
        # 5. Process each new message
        creds = await fetch_tool_credentials(str(tenant_id), tool_id="gmail")
        user_email = (creds.get("email") or creds.get("user_email") or "").strip().lower()

        for msg_id in new_message_ids:
            try:
                email_details = await _get_email_details(tenant_id, msg_id)
                if not email_details:
                    processed_ids.add(msg_id)
                    continue
                
                sender_email = (email_details.get("sender_email") or "").strip().lower()
                if user_email and sender_email == user_email:
                    print(f"[HR POLL] Skipping self-sent email {msg_id} from {sender_email}")
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
                classification = await _classify_email(
                    email_details, open_roles, active_projects, resume_text
                )
                
                email_type = classification.get("email_type", "other")
                
                if email_type == "job_application":
                    applicant_name = classification.get("applicant_name", email_details.get("sender_name", "Unknown"))
                    applicant_email = email_details.get("sender_email", "")
                    matched_role_id = classification.get("matched_role_id")
                    
                    if matched_role_id:
                        role_exists = any(r["id"] == matched_role_id for r in open_roles)
                        if not role_exists:
                            matched_role_id = None
                    
                    if matched_role_id:
                        matched_role = next((r for r in open_roles if r["id"] == matched_role_id), None)
                        
                        app_data = await _backend_post("/internal/hr/applications", {
                            "tenant_id": str(tenant_id),
                            "open_role_id": matched_role_id,
                            "applicant_name": applicant_name,
                            "applicant_email": applicant_email,
                            "email_subject": email_details.get("subject") or "",
                            "email_body": (email_details.get("body") or "")[:5000],
                            "email_message_id": msg_id,
                            "resume_text": (resume_text or "")[:10000],
                            "resume_filename": resume_filename or "",
                            "source": "email",
                        })
                        
                        print(f"[HR POLL] Application stored for role '{matched_role.get('title', 'Unknown')}' from {applicant_email}")
                        
                        ack_sent = await _send_ack_email(
                            tenant_id=str(tenant_id),
                            to_email=applicant_email,
                            applicant_name=applicant_name,
                            role_title=matched_role.get("title", "Open Position"),
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
                            "email_subject": email_details.get("subject") or "",
                            "email_body": (email_details.get("body") or "")[:5000],
                            "email_message_id": msg_id,
                            "resume_text": (resume_text or "")[:10000],
                            "resume_filename": resume_filename or "",
                            "desired_role": classification.get("desired_role") or "",
                        })
                        
                        print(f"[HR POLL] Application from {applicant_email} stored in Talent Pool (no matching role)")
                        
                        await _send_ack_email(
                            tenant_id=str(tenant_id),
                            to_email=applicant_email,
                            applicant_name=applicant_name,
                            matched=False,
                        )

                elif email_type == "project_update":
                    matched_project_id = classification.get("matched_project_id")
                    if matched_project_id:
                        project_obj = next((p for p in active_projects if p["id"] == matched_project_id), None)
                        project_name = project_obj.get("name") if project_obj else (classification.get("project_name") or "Project")

                        # Post project update to database
                        update_res = await _backend_post("/internal/hr/project-update-from-email", {
                            "tenant_id": str(tenant_id),
                            "project_id": matched_project_id,
                            "sender_email": email_details.get("sender_email", ""),
                            "progress_pct": classification.get("progress_pct"),
                            "notes": classification.get("notes") or email_details.get("body", "")[:500],
                            "blockers": classification.get("blockers"),
                        })

                        print(f"[HR POLL] Project update recorded for '{project_name}' from {email_details.get('sender_email')}")

                        # Send reply confirmation email
                        sender_name = email_details.get("sender_name", "Team Member")
                        pct_str = f" to {classification.get('progress_pct')}%" if classification.get("progress_pct") is not None else ""

                        ack_body = (
                            f"Hello {sender_name},\n\n"
                            f"Thank you for your update regarding '{project_name}'. Your progress update{pct_str} has been successfully recorded in the HR Platform.\n\n"
                            f"Summary recorded:\n{classification.get('notes', '')}\n\n"
                            f"Best regards,\nHR & Operations Agent"
                        )

                        await execute_mcp_tool(
                            tenant_id=str(tenant_id),
                            agent_instance_id="workflow-builder",
                            tool_name="gmail",
                            arguments={
                                "action": "send",
                                "to": email_details.get("sender_email", ""),
                                "subject": f"Re: {email_details.get('subject') or 'Project Update Received'}",
                                "body": ack_body,
                            }
                        )
                    else:
                        print(f"[HR POLL] Email {msg_id} classified as project update but no matching active project found.")
                else:
                    print(f"[HR POLL] Email {msg_id} classified as '{email_type}', skipping.")

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
    to team leads of behind-schedule projects (at most once every 24h per project).
    """
    print(f"[HR POLL] Checking project pacing for tenant {str(tenant_id)[:8]}...")
    
    try:
        data = await _backend_get(f"/internal/hr/projects-behind-schedule/{tenant_id}")
        behind_projects = data.get("projects", [])
        
        if not behind_projects:
            print(f"[HR POLL] No projects behind schedule requiring reminder for tenant {str(tenant_id)[:8]}")
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
                    # Update DB timestamp so no duplicate reminder is sent within 24h
                    await _backend_post(f"/internal/hr/projects/{project['id']}/reminder-sent", {})
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
        data = await _backend_get("/internal/hr/tenants-with-gmail")
        tenants = data.get("tenants", [])
        
        if not tenants:
            return
        
        print(f"[HR POLL] Poll cycle #{cycle_count}: {len(tenants)} tenant(s) with Gmail")
        
        for tenant_id in tenants:
            await poll_hr_mailbox(str(tenant_id))
            
            if cycle_count % PACING_CHECK_INTERVAL == 0:
                await check_project_pacing(str(tenant_id))
        
    except Exception as e:
        print(f"[HR POLL] Engine error: {e}")
        traceback.print_exc()


async def start_hr_polling_engine():
    """Start the infinite HR polling loop."""
    print(f"[HR POLL] Engine started. Polling every {HR_POLLING_INTERVAL_SECONDS}s. Pacing check every {PACING_CHECK_INTERVAL} cycles.")
    cycle_count = 0
    
    await asyncio.sleep(5)
    
    while True:
        try:
            cycle_count += 1
            await poll_all_hr_tenants(cycle_count)
        except Exception as e:
            print(f"[HR POLL] Unexpected error in poll loop: {e}")
            traceback.print_exc()
        await asyncio.sleep(HR_POLLING_INTERVAL_SECONDS)
