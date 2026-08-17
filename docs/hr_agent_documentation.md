# HR Agent — Comprehensive System Documentation

## 1. Executive Summary

The **HR Agent** is an autonomous, multi-tenant AI system embedded within the **Enterprise AI Workflow Platform**. It bridges talent acquisition, automated email candidate intake, talent pool matching, and project progress tracking into a single unified operational engine.

By leveraging Large Language Models (LLMs), Retrieval-Augmented Generation (RAG), Qdrant vector database search, and real-time background email polling via Model Context Protocol (MCP) tool adapters, the HR Agent automates high-overhead human resources and project management tasks while keeping team leads and recruiters in full control.

---

## 2. System Architecture & Component Interaction

```
                                  +-----------------------+
                                  |    Next.js UI Frontend |
                                  |     (/app/hr/page)    |
                                  +-----------+-----------+
                                              |
                                              v  HTTP REST API
                                  +-----------+-----------+
                                  |  Node.js Express      |
                                  |  Backend Service      |
                                  +-----+-----------+-----+
                                        |           |
                        Postgres DB     |           |  Internal Token Auth
                     +------------------+           v
                     |                    +---------+---------+
                     v                    |  Python Agent     |
           +------------------+           |  Service          |
           | PostgreSQL DB    |           +----+---------+----+
           | - hr_job_descs   |                |         |
           | - hr_resumes     |   Qdrant RAG   |         v  MCP Tool Gateway
           | - hr_open_roles  |<---------------+     +---+-------------------+
           | - hr_applications|                      | Gmail MCP Adapter     |
           | - hr_talent_pool |                      | (Sends/Reads Emails)  |
           | - hr_employees   |                      +-----------------------+
           | - hr_projects    |
           | - hr_polling_state|
           +------------------+
```

---

## 3. What It Does (Core Capabilities)

The HR Agent performs four primary business functions:

### 1. Manual Resume Screening & AI Candidate Ranking
* **Document Ingestion**: HR managers can create job descriptions and bulk-upload candidate resumes (PDF or DOCX).
* **Automated Text Extraction & Chunking**: Resumes are parsed, chunked, embedded, and stored in a vector database for semantic similarity matching.
* **LLM Candidate Evaluation**: The agent compares full resume text against job requirements and scores candidates on a 0–100 scale, providing 1–2 sentence reasoning and matched skill tags.
* **Automated Interview Invites**: Recruiters can select top candidates and trigger automated personalized interview invitation emails via Gmail.

### 2. Autonomous Email Application Intake
* **Continuous Mailbox Polling**: An asynchronous background engine polls Gmail every 60 seconds for incoming emails matching open positions.
* **AI Intent Classification**: Incoming emails are classified by LLMs into `job_application`, `project_update`, or `other`.
* **Smart Open Role Matching**: Application emails are dynamically matched to active open job roles.
* **Automated Acknowledgment**: When matched, an application record is created and a personalized acknowledgment email is automatically dispatched to the applicant.

### 3. Talent Pool & "Future Prospects" Management
* **Unmatched Prospect Repository**: Candidates applying without an active matching job opening are stored in the Talent Pool ("Future Prospects").
* **Automated Talent Pool Scanning**: When a new role is posted (or manually scanned), the agent re-evaluates all prospects in the talent pool against the new opening.
* **Auto-Transfer & Candidate Re-engagement**: If a strong match is identified (confidence $\ge 0.5$), the prospect is automatically transferred to active applicants for that role, and an automated email notifies the candidate that an appropriate role is now open.

### 4. Automated Project Tracking & Pacing Alerts
* **Email Status Extraction**: Team leads and engineers can report project progress simply by sending or replying to emails. The agent parses progress percentages, status notes, and blockers, updating project dashboards automatically.
* **Behind-Schedule Pacing Engine**: Periodically calculates expected project progress based on start date, target end date, and current date.
* **Automated Reminders with 24h Guardrail**: If a project falls behind schedule by $>15\%$, the agent drafts and sends a firm reminder email to the project team lead. To prevent spamming, reminders are rate-limited to at most once per 24 hours (`last_reminder_sent_at`).

---

## 4. How It Does It (Technical Deep-Dive)

### A. Ingestion & Vector RAG Pipeline
1. **Multer File Buffer**: Node.js handles file uploads (up to 20MB, PDF/DOCX format).
2. **Text Extraction & Chunking**: `extraction.js` converts binaries into clean text; `chunking.js` splits text into semantic blocks while maintaining document order.
3. **Embedding Generation**: `embeddings.js` generates vector embeddings for chunks.
4. **Qdrant Storage**: Vectors are stored in the `hr_resumes` collection with payload metadata (`tenant_id`, `job_description_id`, `resume_id`, `candidate_name`).

### B. AI Candidate Ranking Algorithm
```python
# Location: agent/routers/hr.py -> rank_candidates()
```
* **Step 1**: Retrieve all resume text chunks for the target job description via internal backend RAG endpoints.
* **Step 2**: Reconstruct document hierarchy by sorting chunks by `chunkIndex`.
* **Step 3**: Prompt LLM (`get_llm()`) to analyze candidate resume text against `job_title`, `job_description`, and `job_requirements`.
* **Step 4**: Parse structured JSON output containing:
  * `candidate_name` (extracted full name)
  * `candidate_email`
  * `score` (0-100 float)
  * `reasoning` (succinct justification)
  * `skills_matched` (array of strings)
* **Step 5**: Update PostgreSQL record `hr_resumes` with score, reasoning, matched skills, and status `ready`.

### C. Continuous Email Polling Engine
```python
# Location: agent/hr_polling.py -> start_hr_polling_engine()
```
* **Loop Frequency**: Runs indefinitely every `60 seconds` across all tenants with connected Gmail credentials.
* **State Management**: Tracks processed message IDs in `hr_email_polling_state` table to guarantee zero duplicate processing.
* **Email Fetching**: Executes MCP tool call `gmail` with action `search` and `read_full` to retrieve sender, subject, date, body, and base64 attachments.
* **LLM Classifier Prompt**: Evaluates incoming email against active job roles and active projects simultaneously:
  ```json
  {
    "email_type": "job_application | project_update | other",
    "matched_role_id": "uuid",
    "applicant_name": "string",
    "matched_project_id": "uuid",
    "progress_pct": 60,
    "notes": "string",
    "blockers": "string"
  }
  ```

### D. Automated Project Pacing & Escalation Logic
```python
# Location: agent/hr_polling.py -> check_project_pacing()
```
1. Every 3 polling cycles (every 3 minutes), the engine queries active projects.
2. Calculates elapsed vs. total timeline:
   $$\text{Expected Progress (\%)} = \min\left(100, \left\lfloor \frac{\text{Current Date} - \text{Start Date}}{\text{Target Date} - \text{Start Date}} \right\rfloor \times 100 \right)$$
3. Computes **Pacing Delta**:
   $$\text{Delta} = \text{Current Progress} - \text{Expected Progress}$$
4. If $\text{Delta} < -15\%$ and hours since `last_reminder_sent_at` $> 24$:
   * Identifies project team lead from `hr_project_members`.
   * LLM generates a custom reminder email detailing expected vs. current progress.
   * Dispatches email via Gmail MCP tool adapter.
   * Updates `last_reminder_sent_at = NOW()` in `hr_projects`.

---

## 5. Database Schema & Data Model

The HR Agent data model is split across PostgreSQL tables and Qdrant collections.

### PostgreSQL Tables

| Table Name | Primary Purpose | Key Fields |
| :--- | :--- | :--- |
| `hr_job_descriptions` | Manual recruitment job openings | `id`, `tenant_id`, `title`, `description`, `requirements`, `status` |
| `hr_resumes` | Uploaded resumes & AI scores | `id`, `job_description_id`, `candidate_name`, `candidate_email`, `rank_score`, `rank_reasoning`, `skills_matched`, `status` |
| `hr_open_roles` | Open positions configured for Gmail intake | `id`, `tenant_id`, `title`, `description`, `requirements`, `search_query`, `accepting_until`, `status` |
| `hr_applications` | Ingested candidate email applications | `id`, `open_role_id`, `applicant_name`, `applicant_email`, `resume_text`, `rank_score`, `ack_email_sent`, `source` |
| `hr_talent_pool` | Unmatched candidate prospect repository | `id`, `tenant_id`, `applicant_name`, `applicant_email`, `desired_role`, `status`, `transferred_to_role` |
| `hr_employees` | Company staff directory | `id`, `tenant_id`, `name`, `email`, `position`, `department`, `status` |
| `hr_projects` | Active company projects & progress tracking | `id`, `tenant_id`, `name`, `start_date`, `expected_completion`, `current_progress`, `last_update_summary`, `last_reminder_sent_at` |
| `hr_project_members` | Assignment of employees to projects | `id`, `project_id`, `employee_id`, `role` |
| `hr_project_updates` | Progress updates history | `id`, `project_id`, `submitted_by`, `progress_pct`, `notes`, `blockers` |
| `hr_email_polling_state` | Gmail message deduplication state | `id`, `tenant_id`, `last_processed_message_ids`, `last_checked_at` |

---

## 6. Endpoints Reference

### Public API Endpoints (Backend Node.js Service)
* `POST /api/hr/job-descriptions` — Create new job description.
* `GET /api/hr/job-descriptions` — List job descriptions with resume counts.
* `POST /api/hr/job-descriptions/:id/resumes` — Upload candidate resumes (PDF/DOCX).
* `POST /api/hr/job-descriptions/:id/rank` — Trigger LLM candidate ranking.
* `POST /api/hr/schedule-interview` — Dispatch interview invitations via Gmail.
* `POST /api/hr/open-roles` — Post open role for automated email intake.
* `POST /api/hr/open-roles/:id/scan-pool` — Scan talent pool candidates for matching.
* `GET /api/hr/talent-pool` — Fetch talent pool candidates.

### Internal Microservice Endpoints (Protected by `X-Internal-Token`)
* `POST /agent/hr/rank` — Python agent ranking endpoint.
* `POST /agent/hr/send-emails` — Python agent email dispatch endpoint.
* `POST /agent/hr/scan-talent-pool` — Python agent talent pool scanner.
* `GET /internal/hr/projects-behind-schedule/:tenantId` — Node.js query returning behind-schedule projects.
* `POST /internal/hr/project-update-from-email` — Node.js handler for email-parsed progress updates.

---

## 7. Frontend User Interface

The HR Agent interface is hosted at `/hr` (`frontend/src/app/hr/page.js`) and features four interactive tabs:

1. **Manual Screening Tab**: Upload candidate resumes against specific JDs, trigger rank evaluation, view candidate score badges, and send interview invitations.
2. **Email Application Intake Tab**: Create open job roles, view real-time email ingestion counts, and review AI candidate match scores.
3. **Future Prospects Tab**: Inspect candidates stored in the talent pool, manually trigger talent pool scans, and view transfer history.
4. **Projects & Team Tab**: Create and monitor projects, view completion pacing bars (green = on track, red = behind schedule), view team leads, and inspect full project update audit trails.

---

## 8. Security & Multi-Tenancy Controls

1. **Tenant Isolation**: Every database table includes a `tenant_id` column protected by PostgreSQL Row Level Security (RLS).
2. **Internal Service Tokens**: All inter-service calls between Node.js backend and Python Agent require a valid `X-Internal-Token` HTTP header matching `INTERNAL_SERVICE_TOKEN`.
3. **Credential Encryption**: Integration credentials (e.g., Google OAuth tokens for Gmail) are encrypted at rest using AES-256-GCM encryption in `tool_credentials`.
4. **Rate Limits & Anti-Spam Guardrails**: Pacing reminders enforce a 24-hour rate limit per project to prevent duplicate notifications.
