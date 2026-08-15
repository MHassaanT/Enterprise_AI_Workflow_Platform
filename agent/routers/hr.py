from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
import json
import httpx
from datetime import datetime

from config import settings
from services.hr_rag_client import get_all_hr_resumes
from services.llm_gateway import get_llm
from tool_gateway.centralized_gateway import execute_mcp_tool

router = APIRouter()

class RankRequest(BaseModel):
    tenant_id: str
    job_description_id: str
    job_title: str
    job_description: str
    job_requirements: str
    resume_ids: List[str]

class ScheduleEmailRequest(BaseModel):
    tenant_id: str
    candidate_ids: List[str]
    interview_details: str

@router.post("/rank")
async def rank_candidates(
    request: RankRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    # 1. Prepare Job Description Text
    jd_text = f"{request.job_title}\n{request.job_description}\n{request.job_requirements}"

    # 2. Fetch all resume chunks for this JD via Node backend
    try:
        chunks = await get_all_hr_resumes(
            tenant_id=request.tenant_id,
            job_description_id=request.job_description_id,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve resumes: {str(e)}")

    # Group chunks by resume_id
    resumes_data = {}
    for chunk in chunks:
        r_id = chunk.get("resumeId")
        if r_id and r_id in request.resume_ids:
            if r_id not in resumes_data:
                resumes_data[r_id] = {
                    "candidate_name": chunk.get("candidateName", "Unknown"),
                    "chunks": []
                }
            resumes_data[r_id]["chunks"].append(chunk)

    # Sort chunks by chunkIndex to maintain document order and join text
    for r_id in resumes_data:
        resumes_data[r_id]["chunks"].sort(key=lambda x: x.get("chunkIndex", 0))
        resumes_data[r_id]["text"] = "\n\n".join([c.get("text", "") for c in resumes_data[r_id]["chunks"]])

    # 3. Score each resume with the LLM
    llm = get_llm()
    results = []

    # Update database directly from here
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Note: In a real app we'd use a proper DB service, but here we can just update via the backend internal route
        # Or since this is a proxy from Node, we can just return the scores and let Node do the update.
        pass

    for r_id, data in resumes_data.items():
        prompt = f"""
You are an expert HR Technical Recruiter. Evaluate the following candidate's resume extracts against the Job Description.

Job Title: {request.job_title}
Requirements: {request.job_requirements}
Job Description: {request.job_description}

Candidate Name: {data["candidate_name"]}
Resume Extracts:
{data["text"][:3000]}  # limit text to avoid token limits

Output a JSON object with the following fields:
1. "candidate_name": Extract the real full name of the candidate from the resume if possible, otherwise use "{data["candidate_name"]}".
2. "candidate_email": Extract the email address of the candidate. If not found, output "".
3. "score": An integer from 0 to 100 representing how well the candidate matches the job.
4. "reasoning": A 1-2 sentence explanation for the score.
5. "skills_matched": A list of strings representing key skills from the JD that the candidate possesses.

Return ONLY valid JSON. No markdown backticks.
"""
        try:
            llm_response = await llm.ainvoke(prompt)
            content = llm_response.content.strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()
            elif content.startswith("```"):
                content = content[3:-3].strip()
                
            parsed = json.loads(content)
            
            # Update Postgres DB using Node internal/DB wrapper
            # We don't have a direct DB wrapper for this, so we'll just update directly via asyncpg or httpx
            # Let's write directly to DB to be safe, since we have DATABASE_URL
            import asyncpg
            conn = await asyncpg.connect(settings.DATABASE_URL)
            await conn.execute(
                """
                UPDATE hr_resumes 
                SET rank_score = $1, rank_reasoning = $2, skills_matched = $3, 
                    candidate_name = $4, candidate_email = $5, status = 'ready'
                WHERE id = $6 AND tenant_id = $7
                """,
                float(parsed.get("score", 0)),
                parsed.get("reasoning", ""),
                json.dumps(parsed.get("skills_matched", [])),
                parsed.get("candidate_name", data["candidate_name"]),
                parsed.get("candidate_email", ""),
                r_id,
                request.tenant_id
            )
            await conn.close()
            
            results.append({
                "resume_id": r_id,
                "score": parsed.get("score"),
                "name": parsed.get("candidate_name")
            })
            
        except Exception as e:
            print(f"Failed to score resume {r_id}: {e}")
            # Mark as 0 if failed
            import asyncpg
            conn = await asyncpg.connect(settings.DATABASE_URL)
            await conn.execute(
                """
                UPDATE hr_resumes SET rank_score = 0, rank_reasoning = 'Error during evaluation' 
                WHERE id = $1 AND tenant_id = $2
                """,
                r_id, request.tenant_id
            )
            await conn.close()

    return {"status": "success", "scored": len(results)}


@router.post("/send-emails")
async def send_interview_emails(
    request: ScheduleEmailRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    import asyncpg
    conn = await asyncpg.connect(settings.DATABASE_URL)
    
    # Get candidate details and job title
    candidates = []
    for r_id in request.candidate_ids:
        row = await conn.fetchrow(
            """
            SELECT r.candidate_name, r.candidate_email, jd.title 
            FROM hr_resumes r
            JOIN hr_job_descriptions jd ON r.job_description_id = jd.id
            WHERE r.id = $1 AND r.tenant_id = $2
            """,
            r_id, request.tenant_id
        )
        if row and row['candidate_email']:
            candidates.append({
                "id": r_id,
                "name": row['candidate_name'],
                "email": row['candidate_email'],
                "title": row['title']
            })

    llm = get_llm()
    results = []

    for c in candidates:
        # Draft email
        prompt = f"""
You are an HR Assistant. Draft a professional interview invitation email for a candidate.
Candidate Name: {c["name"]}
Job Title: {c["title"]}
Interview Details: {request.interview_details}

Output a JSON object with:
1. "subject": The email subject line.
2. "body": The plain text email body.

Return ONLY valid JSON. No markdown backticks.
"""
        try:
            llm_response = await llm.ainvoke(prompt)
            content = llm_response.content.strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()
            elif content.startswith("```"):
                content = content[3:-3].strip()
                
            parsed = json.loads(content)
            
            # Send email via MCP gateway
            tool_args = {
                "action": "send",
                "to": c["email"],
                "subject": parsed.get("subject", f"Interview Invitation: {c['title']}"),
                "body": parsed.get("body", f"Hello {c['name']},\n\nWe would like to invite you for an interview. Details:\n{request.interview_details}")
            }
            
            print(f"Sending email to {c['email']}...")
            mcp_response = await execute_mcp_tool(
                tenant_id=request.tenant_id,
                agent_instance_id="workflow-builder", # Dummy for bypass
                tool_name="gmail",
                arguments=tool_args
            )
            
            if "Error:" in mcp_response or "exception" in mcp_response.lower():
                raise Exception(mcp_response)
                
            # Update DB status
            await conn.execute(
                """
                UPDATE hr_resumes SET email_status = 'sent', email_sent_at = NOW() 
                WHERE id = $1 AND tenant_id = $2
                """,
                c["id"], request.tenant_id
            )
            results.append({"id": c["id"], "status": "sent"})
            
        except Exception as e:
            print(f"Failed to send email to {c['name']}: {e}")
            await conn.execute(
                """
                UPDATE hr_resumes SET email_status = 'failed', error_message = $1 
                WHERE id = $2 AND tenant_id = $3
                """,
                str(e), c["id"], request.tenant_id
            )
            results.append({"id": c["id"], "status": "failed", "error": str(e)})

    await conn.close()
    return {"status": "success", "results": results}


class ScanTalentPoolRequest(BaseModel):
    tenant_id: str
    open_role_id: str
    role_title: str
    role_description: str
    role_requirements: str


class RankApplicationsRequest(BaseModel):
    tenant_id: str
    open_role_id: str
    role_title: str
    role_description: str
    role_requirements: str
    application_ids: List[str]


class ProjectPacingRequest(BaseModel):
    tenant_id: str


@router.post("/scan-talent-pool")
async def scan_talent_pool(
    request: ScanTalentPoolRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    # Fetch talent pool entries for this tenant
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.BACKEND_URL}/internal/hr/talent-pool/{request.tenant_id}",
                headers={"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN},
            )
            response.raise_for_status()
            prospects = response.json().get("prospects", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch talent pool: {str(e)}")

    if not prospects:
        return {"status": "success", "transferred": 0, "message": "No prospects in talent pool."}

    llm = get_llm()
    transferred = []

    for prospect in prospects:
        # Use LLM to check if prospect matches the new role
        prompt = f"""You are an HR matching assistant. Determine if this candidate is a potential match for a new job opening.

New Open Role:
- Title: {request.role_title}
- Description: {request.role_description}
- Requirements: {request.role_requirements}

Candidate Profile:
- Name: {prospect.get('applicant_name', 'Unknown')}
- Desired Role: {prospect.get('desired_role', 'Not specified')}
- Email Subject: {prospect.get('email_subject', '')}
- Resume/Body: {(prospect.get('resume_text', '') or prospect.get('email_body', ''))[:2000]}

Is this candidate a reasonable match for the open role? Consider their desired role, skills mentioned in resume/email, and the job requirements.

Respond with ONLY a valid JSON object:
{{
  "is_match": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}}
Do not include markdown backticks.
"""
        try:
            llm_response = await llm.ainvoke(prompt)
            content = llm_response.content.strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()
            elif content.startswith("```"):
                content = content[3:-3].strip()

            parsed = json.loads(content)

            if parsed.get("is_match", False) and parsed.get("confidence", 0) >= 0.5:
                # Transfer prospect to the new role
                try:
                    async with httpx.AsyncClient(timeout=30.0) as client:
                        transfer_response = await client.patch(
                            f"{settings.BACKEND_URL}/internal/hr/talent-pool/{prospect['id']}/transfer",
                            json={
                                "open_role_id": request.open_role_id,
                                "tenant_id": request.tenant_id,
                            },
                            headers={"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN},
                        )
                        transfer_response.raise_for_status()

                    # Send notification email to the applicant
                    from tool_gateway.centralized_gateway import execute_mcp_tool

                    email_prompt = f"""You are an HR Assistant. Draft a professional email notifying a candidate that a role they previously applied for is now open.

Candidate Name: {prospect.get('applicant_name', 'Applicant')}
Role Title: {request.role_title}
Original Application: They applied previously but the role was not available at the time.

Write a warm, professional email informing them that the position is now open and their application has been transferred for consideration.

Output a JSON object with:
1. "subject": The email subject line.
2. "body": The plain text email body.

Return ONLY valid JSON. No markdown backticks.
"""
                    email_response = await llm.ainvoke(email_prompt)
                    email_content = email_response.content.strip()
                    if email_content.startswith("```json"):
                        email_content = email_content[7:-3].strip()
                    elif email_content.startswith("```"):
                        email_content = email_content[3:-3].strip()

                    email_parsed = json.loads(email_content)

                    await execute_mcp_tool(
                        tenant_id=request.tenant_id,
                        agent_instance_id="workflow-builder",
                        tool_name="gmail",
                        arguments={
                            "action": "send",
                            "to": prospect.get("applicant_email", ""),
                            "subject": email_parsed.get("subject", f"Update: {request.role_title} is Now Open"),
                            "body": email_parsed.get("body", ""),
                        }
                    )

                    transferred.append({
                        "prospect_id": prospect["id"],
                        "name": prospect.get("applicant_name"),
                        "email": prospect.get("applicant_email"),
                    })

                    print(f"[HR] Transferred prospect {prospect.get('applicant_name')} to role '{request.role_title}'")

                except Exception as te:
                    print(f"[HR] Failed to transfer prospect {prospect['id']}: {te}")

        except Exception as e:
            print(f"[HR] Failed to evaluate prospect {prospect['id']}: {e}")

    return {
        "status": "success",
        "transferred": len(transferred),
        "details": transferred,
    }


@router.post("/rank-applications")
async def rank_applications(
    request: RankApplicationsRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    """Rank email-sourced applications against an open role using LLM."""
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    import asyncpg
    conn = await asyncpg.connect(settings.DATABASE_URL)

    results = []
    llm = get_llm()

    for app_id in request.application_ids:
        # Fetch application data
        row = await conn.fetchrow(
            "SELECT * FROM hr_applications WHERE id = $1 AND tenant_id = $2",
            app_id, request.tenant_id
        )

        if not row:
            continue

        resume_text = row.get("resume_text", "") or row.get("email_body", "") or ""

        prompt = f"""You are an expert HR Technical Recruiter. Evaluate this candidate's application against the Job Description.

Job Title: {request.role_title}
Requirements: {request.role_requirements}
Job Description: {request.role_description}

Candidate Name: {row['applicant_name']}
Application Source: Email
Resume/Application Text:
{resume_text[:3000]}

Output a JSON object with:
1. "candidate_name": The candidate's real name (or use "{row['applicant_name']}").
2. "score": An integer from 0 to 100 representing how well the candidate matches.
3. "reasoning": A 1-2 sentence explanation for the score.
4. "skills_matched": A list of key matching skills.

Return ONLY valid JSON. No markdown backticks.
"""
        try:
            llm_response = await llm.ainvoke(prompt)
            content = llm_response.content.strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()
            elif content.startswith("```"):
                content = content[3:-3].strip()

            parsed = json.loads(content)

            await conn.execute(
                """
                UPDATE hr_applications
                SET rank_score = $1, rank_reasoning = $2, skills_matched = $3,
                    applicant_name = $4, status = 'ready'
                WHERE id = $5 AND tenant_id = $6
                """,
                float(parsed.get("score", 0)),
                parsed.get("reasoning", ""),
                json.dumps(parsed.get("skills_matched", [])),
                parsed.get("candidate_name", row["applicant_name"]),
                app_id,
                request.tenant_id,
            )

            results.append({
                "application_id": app_id,
                "score": parsed.get("score"),
                "name": parsed.get("candidate_name"),
            })

        except Exception as e:
            print(f"[HR] Failed to score application {app_id}: {e}")
            await conn.execute(
                "UPDATE hr_applications SET rank_score = 0, rank_reasoning = 'Error during evaluation' WHERE id = $1",
                app_id,
            )

    await conn.close()
    return {"status": "success", "scored": len(results)}


@router.post("/check-project-pacing")
async def check_project_pacing_endpoint(
    request: ProjectPacingRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    """Manually trigger project pacing check for a tenant."""
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    from hr_polling import check_project_pacing
    await check_project_pacing(request.tenant_id)

    return {"status": "success", "message": "Project pacing check completed."}
