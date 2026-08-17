# PM Agent Separation & Transfer Documentation

## 1. Overview & Rationale

As the **Enterprise AI Workflow Platform** scaled, project management, team roster tracking, and pacing velocity alerts evolved beyond the core scope of the **HR Agent** (which primarily handles recruitment, resume screening, talent pool management, and employee attendance).

To establish clear domain boundaries while preserving 100% stability and zero backend regression, the project management user interface was extracted into a dedicated **PM Agent** (Project Management Agent) accessible at `/pm`.

### Key Outcomes:
* **HR Agent (`/hr`)**: Cleanly dedicated to candidate recruitment, resume screening, talent pool ingestion, and daily employee attendance.
* **PM Agent (`/pm`)**: Dedicated to project creation, team roster assignments, progress velocity monitoring, mathematical pacing checks, and status update feeds.
* **Shared Background Infrastructure**: The underlying database tables, backend APIs, and Python email polling engine remain shared and intact, requiring **zero backend re-architecture** or migration risk.

---

## 2. System Architecture & Component Mapping

```
+-----------------------------------------------------------------------------------+
|                                 FRONTEND LAYER                                    |
|                                                                                   |
|    +-----------------------------+               +---------------------------+    |
|    |      HR Agent (/hr)         |               |      PM Agent (/pm)       |    |
|    |-----------------------------|               |---------------------------|    |
|    | * Manual Screening          |               | * Projects Grid & Detail  |    |
|    | * Email Application Intake  |               | * Team Roster Directory   |    |
|    | * Future Prospects Pool     |               | * Manual Progress Post    |    |
|    | * Attendance Calendar       |               | * Pacing Check Trigger    |    |
|    +--------------+--------------+               +-------------+-------------+    |
+-------------------|--------------------------------------------|------------------+
                    |                                            |
                    +--------------------+-----------------------+
                                         | (REST APIs via /lib/api.js)
                                         v
+-----------------------------------------------------------------------------------+
|                                 BACKEND LAYER                                     |
|                                                                                   |
|    Node.js Express Backend API Routes (/src/routes/hr_team.js & /src/routes/internal.js)
|    - GET / POST / PATCH / DELETE /api/hr/projects                                  |
|    - GET / POST / DELETE /api/hr/employees                                        |
|    - POST /api/hr/projects/check-pacing                                          |
|    - Internal Microservice endpoints (/internal/hr/*)                             |
+----------------------------------------+------------------------------------------+
                                         |
                    +--------------------+--------------------+
                    |                                         |
                    v                                         v
+---------------------------------------+   +---------------------------------------+
|            DATABASE LAYER             |   |        BACKGROUND ENGINE LAYER        |
|                                       |   |                                       |
| PostgreSQL Database                   |   | Python Agent Service (agent/hr_polling)|
| - hr_projects                         |   | - Gmail polling loop (60s cycle)      |
| - hr_project_members                  |   | - LLM email classification            |
| - hr_project_updates                  |   | - Pacing engine calculation (3 min)   |
| - hr_employees                        |   | - Gmail reminder email dispatch       |
+---------------------------------------+   +---------------------------------------+
```

---

## 3. Detailed Component & File Breakdown

### A. Frontend Routes & UI

1. **`frontend/src/app/pm/page.js`** *(NEW)*:
   * Main entry point for the PM Agent.
   * Renders `AuthGuard`, navigation header, PM Agent branding (`account_tree` icon), and embeds `ProjectsTab`.

2. **`frontend/src/app/pm/ProjectsTab.js`** *(NEW)*:
   * Core operational dashboard for the PM Agent.
   * **Projects View**: Displays project cards with status badges (*Ahead*, *On Track*, *At Risk*, *Behind Schedule*), progress bars, and deadline timers.
   * **Project Detail View**: Renders team member rosters, status update logs, manual update submission, and member assignment.
   * **Team Directory View**: Manages company employees, department assignments, and attendance link generation.
   * **Pacing Trigger**: Contains the **"Check Pacing & Notify"** action button.

3. **`frontend/src/app/hr/page.js`** *(MODIFIED)*:
   * Updated header subtitle to *"Recruitment & Talent Management Platform"*.
   * Removed `TeamProjectsTab` and the `Projects & Team` navigation tab.

4. **`frontend/src/app/page.js`** *(MODIFIED)*:
   * Added the **PM Agent** quick action card to the main Tenant Control Panel dashboard linking directly to `/pm`.

---

### B. Shared Backend Infrastructure (Intact & Unchanged)

To ensure zero risk of breaking existing production behavior:

1. **`backend/src/routes/hr_team.js`**:
   * Continues serving endpoints for project and employee management:
     * `GET /api/hr/projects` & `POST /api/hr/projects`
     * `GET /api/hr/projects/:id` & `PATCH /api/hr/projects/:id`
     * `POST /api/hr/projects/:id/members`
     * `POST /api/hr/projects/:id/updates`
     * `POST /api/hr/projects/check-pacing`

2. **`backend/src/routes/internal.js`**:
   * Continues serving internal microservice endpoints (`X-Internal-Token` protected) used by the Python polling service:
     * `GET /internal/hr/active-projects/:tenantId`
     * `POST /internal/hr/project-update-from-email`
     * `GET /internal/hr/projects-behind-schedule/:tenantId`
     * `POST /internal/hr/projects/:id/reminder-sent`

3. **`agent/hr_polling.py`**:
   * Continues operating as the background worker service:
     * Checks Gmail every 60 seconds for status emails.
     * Uses LLM to extract completion percentages, notes, and blockers.
     * Evaluates project pacing every 3 minutes.
     * Dispatches reminder emails to project leads if a project is $>15\%$ behind schedule, enforcing a 24-hour rate limit via `last_reminder_sent_at`.

---

## 4. Operation & Maintenance Guidelines

### For Developers:
* **Adding PM Features**: Extend `frontend/src/app/pm/ProjectsTab.js` or create subcomponents inside `frontend/src/app/pm/components/`.
* **API Calls**: Continue using `fetchProjects()`, `createProject()`, `submitProjectUpdate()`, etc. in `frontend/src/lib/api.js`.
* **Authentication & RBAC**: The `/pm` route is guarded by `AuthGuard` and leverages tenant-level multi-tenancy (RLS) automatically through standard session authorization headers.
