# Enterprise AI Platform — Unified Service Orchestration & Startup Automation Report

## Executive Summary

This report documents the architectural design, implementation, and operational verification of the unified service orchestration and lifecycle management system for the **Enterprise AI Workforce & Workflow Platform**. 

Prior to this implementation, starting the platform required developers and operators to manually manage multiple terminal sessions, coordinate startup timing across heterogeneous infrastructure layers (Docker containers for PostgreSQL, Qdrant, and Redis), manually trigger database schema migrations, and individually launch the Node.js API Gateway and Python FastAPI LangGraph microservices. 

To eliminate configuration friction, eliminate port collision risks, and ensure reliable execution across local and remote environments, a unified startup orchestration engine ([`start.sh`](file:///home/hassaan/Desktop/Projects/Enterprise%20AI%20Workflow%20Platform/start.sh)) and companion teardown engine ([`stop.sh`](file:///home/hassaan/Desktop/Projects/Enterprise%20AI%20Workflow%20Platform/stop.sh)) were developed in the root of the project.

---

## 1. System Topology & Architecture

The Enterprise AI Workflow Platform relies on a multi-tier microservice architecture where services must boot up in a strictly ordered dependency sequence:

```mermaid
flowchart TD
    subgraph Infrastructure Layer
        PG["PostgreSQL 15 (RLS)<br/>:5432"]
        QD["Qdrant Vector DB<br/>:6333"]
        RD["Redis 7 (Alpine)<br/>:6379"]
    end

    subgraph Data Migration Layer
        MIG["Database Migrations<br/>(45 SQL Scripts)"]
    end

    subgraph Backend Microservice Layer
        GW["Node.js Express API Gateway<br/>:4000"]
        AGT["Python FastAPI Agent Service<br/>(LangGraph + FastMCP)<br/>:8000"]
    end

    subgraph Presentation Layer
        FE["Next.js 16 Web Dashboard<br/>:3000"]
    end

    Infrastructure Layer -->|Readiness Probes Pass| Data Migration Layer
    Data Migration Layer -->|Schema Synchronized| Backend Microservice Layer
    Backend Microservice Layer -->|Health Endpoints 200 OK| Presentation Layer
```

### Dependency Ordering Rules

1. **Databases First**: PostgreSQL, Qdrant, and Redis must not only be started as Docker containers, but must also be actively accepting socket connections before downstream services attempt to connect.
2. **Schema Synchronization**: Database migrations (`backend/database/run_migrations.js`) must run before backend services launch to ensure table structures, RLS policies, and seed rows are up-to-date.
3. **Backend Microservices Concurrent Boot**: The Node.js API Gateway and Python FastAPI microservices are launched concurrently with proper process group detachment (`setsid`), individual PID tracking, and log redirection.
4. **Health Verification**: Active HTTP polling against `/health` endpoints guarantees services are genuinely operational before declaring readiness.

---

## 2. Startup Orchestration Engine (`start.sh`)

[`start.sh`](file:///home/hassaan/Desktop/Projects/Enterprise%20AI%20Workflow%20Platform/start.sh) is a POSIX-compliant bash script configured with `set -eo pipefail` for defensive execution.

### 2.1 Pre-Flight Verification & Environment Provisioning

The script dynamically detects system tools and sets up required runtime directories:
- **Directory Resolution**: Automatically resolves the repository root directory relative to the script path (`SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`), allowing the script to be invoked from any working directory.
- **Runtime Directories**: Creates `.run/` for process identification files (`*.pid`) and `logs/` for service logs.
- **Docker Compose Detection**: Dynamically inspects the host system for `docker compose` (Docker CLI v2 plugin) or legacy `docker-compose`.
- **Environment Auto-Provisioning**: Checks for `.env`, `backend/.env`, and `agent/.env`. If missing, provisions them automatically from `.env.example`.
- **Python Virtualenv Resolution**: Inspects `agent/.venv` (standard venv) and `agent/venv`, selecting the correct Python binary and `uvicorn` executable, with a graceful fallback to system `python3`.

### 2.2 Infrastructure Database Launch & Readiness Probes

Databases are managed through `docker-compose.yml`:
- **PostgreSQL 15**: Verified via `docker exec ai_platform_postgres pg_isready -U hassan -d ai_platform`.
- **Redis 7**: Verified via `docker exec ai_platform_redis redis-cli ping` expecting `PONG`.
- **Qdrant Vector DB**: Verified via HTTP probes to `http://localhost:6333/readyz` and `/dashboard`.

Each readiness probe runs in a polling loop (up to 30 seconds) with 1-second intervals, preventing race conditions where backend services fail due to uninitialized databases.

### 2.3 Automated Database Migrations

Once PostgreSQL is verified ready, the script executes:
```bash
node backend/database/run_migrations.js >> logs/migrations.log 2>&1
```
This migration runner evaluates all 45 `.sql` schema files in `backend/database/migrations/`, idempotently verifying existing tables, views, and RLS policies, and applying new migrations in sequence.

### 2.4 True Daemonization & Session Detachment

To ensure backend services remain running in background mode across terminal disconnections or subshell exits, processes are launched with `setsid` and `/dev/null` standard input redirection:

```bash
# Node.js API Gateway
(
    cd "${ROOT_DIR}/backend"
    setsid node src/index.js >> "${LOG_DIR}/backend.log" 2>&1 < /dev/null &
    echo $! > "${BACKEND_PID_FILE}"
)

# Python FastAPI Agent Microservice
(
    cd "${ROOT_DIR}/agent"
    setsid "${VENV_UVICORN}" main:app --host 0.0.0.0 --port 8000 --reload >> "${LOG_DIR}/agent.log" 2>&1 < /dev/null &
    echo $! > "${AGENT_PID_FILE}"
)
```

**Why `setsid`?**
Standard backgrounding (`nohup ... &`) retains the launching terminal's process group. In headless automation or subshell execution, exiting the parent script can transmit `SIGHUP` or trigger process group teardown. `setsid` establishes a new session leader and process group, ensuring persistent execution.

### 2.5 Active Health Polling

Immediately following process launch, `start.sh` polls each service's health endpoint every second for up to 35 seconds:
- Node.js API Gateway: `http://localhost:4000/health`
- Python Agent Service: `http://localhost:8000/health`

If a process exits unexpectedly during this window, the script immediately catches the failure, surfaces an error message, and directs the user to inspect the relevant log file.

### 2.6 Live Status Summary Dashboard

Upon successful startup, `start.sh` displays a color-coded status dashboard:

```text
================================================================
  Enterprise AI Platform Status
================================================================

Databases & Infrastructure (Docker):
NAMES                  STATUS         PORTS
ai_platform_postgres   Up 2 minutes   0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
ai_platform_redis      Up 2 minutes   0.0.0.0:6379->6379/tcp, [::]:6379->6379/tcp
ai_platform_qdrant     Up 2 minutes   0.0.0.0:6333->6333/tcp, [::]:6333->6333/tcp

Backend Services:
  • Node.js API Gateway:      RUNNING (PID: 9980, Port: 4000) -> http://localhost:4000/health
  • Python FastAPI Agent:     RUNNING (PID: 10001, Port: 8000) -> http://localhost:8000/health | Docs: http://localhost:8000/docs
  • Next.js Frontend:         STOPPED (Use --with-frontend to start)

Service Endpoints:
  • API Gateway:     http://localhost:4000
  • Agent API:       http://localhost:8000 (Swagger UI: http://localhost:8000/docs)
  • Qdrant Web UI:   http://localhost:6333/dashboard
  • PostgreSQL:      localhost:5432 (DB: ai_platform)
  • Redis:           localhost:6379

Log Files:
  • Backend logs:    logs/backend.log
  • Agent logs:      logs/agent.log
  • Migrations log:  logs/migrations.log
```

---

## 3. Teardown Engine (`stop.sh`)

[`stop.sh`](file:///home/hassaan/Desktop/Projects/Enterprise%20AI%20Workflow%20Platform/stop.sh) handles the graceful teardown of running services:

### 3.1 Two-Stage Process Termination
1. **Graceful `SIGTERM`**: Sends `SIGTERM` to both the recorded PID and its process group (`kill -TERM -- -"$pid"`), allowing Uvicorn and Express to finish in-flight requests and close database connections cleanly.
2. **Fallback `SIGKILL` (`kill -9`)**: If a process fails to terminate within 5 seconds, forces termination.
3. **Port Reconciliation**: Scans ports `4000`, `8000`, and `3000` via `fuser` / `lsof` to ensure no orphan worker processes (e.g. Uvicorn WatchFiles child processes) remain bound to required ports.

### 3.2 Selective Docker Teardown
- **Default (`./stop.sh`)**: Terminates Node and Python backend services, while leaving Docker database containers running. This optimizes developer turnaround by avoiding cold database restarts on subsequent runs.
- **Full Teardown (`./stop.sh --all`)**: Gracefully shuts down the Docker containers (`docker compose stop`) in addition to stopping backend services.

---

## 4. CLI Operation Reference

| Command | Action / Description |
|---|---|
| `./start.sh` | Default background startup. Starts databases, runs migrations, launches backends, checks health, and exits cleanly. |
| `./start.sh --foreground` (or `-f`) | Launches all services and tails `logs/backend.log` and `logs/agent.log`. Traps `Ctrl+C` to cleanly shut down services. |
| `./start.sh --with-frontend` (or `--all`) | Starts databases, backends, and launches Next.js frontend (`:3000`). |
| `./start.sh --skip-migrations` | Starts services without executing the SQL migration runner. |
| `./start.sh status` | Queries running Docker containers, process PIDs, ports, and health endpoints. |
| `./start.sh restart` | Invokes `./stop.sh` followed by a fresh `./start.sh`. |
| `./stop.sh` | Stops all running backend processes and frees ports. Leaves databases running. |
| `./stop.sh --all` | Stops all backend processes and stops Docker database containers. |

---

## 5. Verification & Test Matrix

| Test Case | Scenario | Expected Behavior | Actual Result |
|---|---|---|---|
| **TC-01: Syntax Verification** | `bash -n start.sh && bash -n stop.sh` | Zero syntax errors or warnings | Passed (Code 0) |
| **TC-02: Cold Start** | Docker stopped, ports closed, run `./start.sh` | Containers start, migrations run, services become healthy | Passed (Postgres, Redis, Qdrant Up; Node & Python healthy) |
| **TC-03: Health Endpoint Probing** | `curl localhost:4000/health` and `curl localhost:8000/health` | Both return HTTP 200 with JSON payload | Passed (`{"status":"API Gateway running"}`, `{"status":"Agent orchestration service running"}`) |
| **TC-04: Idempotent Execution** | Run `./start.sh` while services are already active | Warns that processes are active without crashing or port collision | Passed (`[WARN] Node.js API Gateway is already running`) |
| **TC-05: Status Reporting** | `./start.sh status` while running | Correctly identifies Docker containers, PIDs, and URLs | Passed |
| **TC-06: Teardown** | Run `./stop.sh` | PIDs terminated, ports 4000 and 8000 freed, `.run/*.pid` removed | Passed |
| **TC-07: Restart Flow** | Run `./start.sh restart` | Shuts down active services and reboots all components to healthy state | Passed |
| **TC-08: Git Hygiene** | `git status` after startup | `logs/` and `.run/` ignored via `.gitignore` | Passed (Working tree clean) |

---

## 6. Summary & Recommendations

The implementation of `start.sh` and `stop.sh` provides a single entry point for platform startup, eliminating human error during multi-service boot sequences and synchronizing the full stack from vector database to application layer in under 15 seconds.

### Recommendations:
1. **Developer Workstations**: Use `./start.sh` for fast background startup during daily development, and `./start.sh --foreground` when debugging real-time agent output.
2. **CI/CD Pipelines**: Incorporate `./start.sh` into integration test workflows to ensure a standardized database and microservice environment before executing end-to-end tests.
3. **Teardown at Day-End**: Run `./stop.sh --all` to release system RAM and pause Docker volumes when not developing.
