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
