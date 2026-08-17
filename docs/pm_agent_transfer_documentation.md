# PM Agent Separation & Transfer Documentation

## 1. Overview & Rationale

As the **Enterprise AI Workflow Platform** scaled, project management, progress velocity monitoring, and pacing alerts were separated from the **HR Agent** into a dedicated **PM Agent** (Project Management Agent) accessible at `/pm`.

### Division of Responsibilities:
* **HR Agent (`/hr`)**: Manages human resources and candidate recruitment — Manual Candidate Screening, Email Application Intake, Future Prospects Pool, **Team Directory & Employee Roster Management**, and Attendance.
* **PM Agent (`/pm`)**: Manages projects and execution — Project creation & deletion, pacing velocity checks, project status update feeds, and project team roster assignments (assigning existing employees to projects).
* **Sidebar Navigation**: Both **HR Agent** (`/hr`) and **PM Agent** (`/pm`) are directly accessible from the main navigation sidebar.

---

## 2. System Architecture & Component Mapping

```
+-----------------------------------------------------------------------------------+
|                                 FRONTEND LAYER                                    |
|                                                                                   |
|    +-----------------------------+               +---------------------------+    |
|    |      HR Agent (/hr)         |               |      PM Agent (/pm)       |    |
|    |-----------------------------|               |---------------------------|    |
|    | * Manual Screening          |               | * Projects Grid & Details |    |
|    | * Email Application Intake  |               | * Project Member Assign   |    |
|    | * Future Prospects Pool     |               | * Status Updates Feed     |    |
|    | * Team Directory (Employees)|               | * Pacing Check Trigger    |    |
|    | * Attendance Calendar       |               |                           |    |
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

### A. Frontend Components & Navigation

1. **`frontend/src/app/components/Sidebar.js`**:
   * Added `{ label: 'PM Agent', href: '/pm', icon: 'account_tree' }` to the main navigation menu alongside `HR Agent`.

2. **`frontend/src/app/pm/page.js`**:
   * Top-level PM Agent dashboard page rendering header branding (`account_tree` icon) and embedding `ProjectsTab`.

3. **`frontend/src/app/pm/ProjectsTab.js`**:
   * Purely focused on Project operations.
   * **Projects View**: Displays project cards with status badges (*Ahead*, *On Track*, *At Risk*, *Behind Schedule*), progress bars, and deadline timers.
   * **Project Detail View**: Renders assigned team member rosters, status update logs, manual update submission, and assigning existing employees to projects.
   * **Pacing Trigger**: Contains the **"Check Pacing & Notify"** action button.

4. **`frontend/src/app/hr/EmployeesTab.js`**:
   * Dedicated HR component for managing company personnel:
     * Add single employee manually.
     * Bulk import employees via CSV/XLSX spreadsheet.
     * Delete employees.
     * Generate & copy unique employee attendance link.
     * View assigned projects per employee.

5. **`frontend/src/app/hr/page.js`**:
   * Contains tabs: **Manual Screening**, **Email Application Intake**, **Future Prospects**, **Team Directory** (`EmployeesTab`), and **Attendance**.

---

## 4. Operation & Maintenance Guidelines

* **HR Duties**: All employee management (adding personnel, uploading rosters, deleting employees, attendance tokens) is done under HR Agent $\rightarrow$ **Team Directory** (`/hr`).
* **PM Duties**: Project delivery management (creating projects, tracking velocity pacing, logging status updates, assigning members to projects) is done under PM Agent $\rightarrow$ **Projects** (`/pm`).
