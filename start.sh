#!/usr/bin/env bash

# ==============================================================================
# Enterprise AI Workflow Platform — Startup & Service Orchestration Script
#
# Fires up:
#   1. Databases: PostgreSQL (5432), Qdrant (6333), Redis (6379) via Docker Compose
#   2. Database Migrations: Auto-runs backend/database/run_migrations.js
#   3. API Gateway: Node.js Express server (:4000)
#   4. Agent Microservice: Python FastAPI + LangGraph service (:8000)
#   5. [Optional] Frontend: Next.js UI (:3000) with --with-frontend flag
#
# Usage:
#   ./start.sh                 # Start databases and backends in background
#   ./start.sh --foreground    # Run in foreground (Ctrl+C stops backends)
#   ./start.sh --with-frontend # Also launch Next.js frontend
#   ./start.sh status          # View service health and status
#   ./start.sh stop            # Stop running backend services
# ==============================================================================

set -eo pipefail

# Script directory resolution
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}"

# Runtime paths
RUN_DIR="${ROOT_DIR}/.run"
LOG_DIR="${ROOT_DIR}/logs"
BACKEND_PID_FILE="${RUN_DIR}/backend.pid"
AGENT_PID_FILE="${RUN_DIR}/agent.pid"
FRONTEND_PID_FILE="${RUN_DIR}/frontend.pid"

# Colors for terminal output
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
BLUE="\033[0;34m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m" # No Color

# Default flags
FOREGROUND=false
WITH_FRONTEND=false
SKIP_MIGRATIONS=false

# ------------------------------------------------------------------------------
# Logging & Helper Functions
# ------------------------------------------------------------------------------
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "\n${BOLD}${CYAN}================================================================${NC}"
    echo -e "${BOLD}${CYAN}  $1${NC}"
    echo -e "${BOLD}${CYAN}================================================================${NC}\n"
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "Missing required command: '$1'. Please install it before running this script."
        exit 1
    fi
}

# Detect Docker Compose command
detect_docker_compose() {
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    elif docker-compose version &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    else
        log_error "Neither 'docker compose' nor 'docker-compose' was found."
        exit 1
    fi
}

# Check if a process with a PID is alive
is_pid_running() {
    local pid="$1"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Check if a port is in use
is_port_in_use() {
    local port="$1"
    if command -v ss &>/dev/null; then
        ss -tulpn 2>/dev/null | grep -q ":${port}\b" && return 0
    elif command -v lsof &>/dev/null; then
        lsof -i ":${port}" &>/dev/null && return 0
    elif command -v fuser &>/dev/null; then
        fuser "${port}/tcp" &>/dev/null && return 0
    fi
    return 1
}

# ------------------------------------------------------------------------------
# Pre-Flight Checks
# ------------------------------------------------------------------------------
preflight_checks() {
    log_info "Running pre-flight checks..."

    mkdir -p "${RUN_DIR}" "${LOG_DIR}"

    check_command "docker"
    detect_docker_compose
    check_command "node"
    check_command "npm"
    check_command "curl"

    if ! docker info &>/dev/null; then
        log_error "Docker daemon is not running. Please start Docker and retry."
        exit 1
    fi

    # Check environment files
    if [ ! -f "${ROOT_DIR}/.env" ] && [ -f "${ROOT_DIR}/.env.example" ]; then
        log_warn "Root .env not found. Copying from .env.example..."
        cp "${ROOT_DIR}/.env.example" "${ROOT_DIR}/.env"
    fi

    if [ ! -f "${ROOT_DIR}/backend/.env" ] && [ -f "${ROOT_DIR}/.env.example" ]; then
        log_warn "backend/.env not found. Copying from .env.example..."
        cp "${ROOT_DIR}/.env.example" "${ROOT_DIR}/backend/.env"
    fi

    if [ ! -f "${ROOT_DIR}/agent/.env" ] && [ -f "${ROOT_DIR}/.env.example" ]; then
        log_warn "agent/.env not found. Copying from .env.example..."
        cp "${ROOT_DIR}/.env.example" "${ROOT_DIR}/agent/.env"
    fi

    # Determine Python & virtualenv for agent
    if [ -f "${ROOT_DIR}/agent/.venv/bin/python" ]; then
        VENV_PYTHON="${ROOT_DIR}/agent/.venv/bin/python"
        VENV_UVICORN="${ROOT_DIR}/agent/.venv/bin/uvicorn"
    elif [ -f "${ROOT_DIR}/agent/venv/bin/python" ]; then
        VENV_PYTHON="${ROOT_DIR}/agent/venv/bin/python"
        VENV_UVICORN="${ROOT_DIR}/agent/venv/bin/uvicorn"
    elif command -v python3 &>/dev/null; then
        log_warn "No virtualenv found at agent/.venv or agent/venv. Falling back to system python3."
        VENV_PYTHON="python3"
        VENV_UVICORN="uvicorn"
    else
        log_error "Python 3 is required for the agent microservice."
        exit 1
    fi

    log_success "Pre-flight checks passed."
}

# ------------------------------------------------------------------------------
# 1. Start Databases (Docker Compose)
# ------------------------------------------------------------------------------
start_databases() {
    log_header "1. Starting Infrastructure Databases"

    log_info "Launching PostgreSQL (5432), Qdrant (6333), and Redis (6379)..."
    (cd "${ROOT_DIR}" && $DOCKER_COMPOSE up -d)

    # Wait for PostgreSQL
    log_info "Waiting for PostgreSQL to be ready on port 5432..."
    local pg_ready=false
    for i in {1..30}; do
        if docker exec ai_platform_postgres pg_isready -U hassan -d ai_platform &>/dev/null; then
            pg_ready=true
            break
        fi
        sleep 1
    done

    if [ "$pg_ready" = true ]; then
        log_success "PostgreSQL is ready!"
    else
        log_warn "PostgreSQL readiness probe timed out; continuing anyway."
    fi

    # Wait for Redis
    log_info "Waiting for Redis to be ready on port 6379..."
    local redis_ready=false
    for i in {1..20}; do
        if docker exec ai_platform_redis redis-cli ping &>/dev/null; then
            redis_ready=true
            break
        fi
        sleep 1
    done

    if [ "$redis_ready" = true ]; then
        log_success "Redis is ready!"
    else
        log_warn "Redis readiness probe timed out; continuing anyway."
    fi

    # Wait for Qdrant
    log_info "Waiting for Qdrant to be ready on port 6333..."
    local qdrant_ready=false
    for i in {1..20}; do
        if curl -s -f http://localhost:6333/readyz &>/dev/null || curl -s -f http://localhost:6333/dashboard &>/dev/null; then
            qdrant_ready=true
            break
        fi
        sleep 1
    done

    if [ "$qdrant_ready" = true ]; then
        log_success "Qdrant Vector DB is ready!"
    else
        log_warn "Qdrant readiness probe timed out; continuing anyway."
    fi
}

# ------------------------------------------------------------------------------
# 2. Run Database Migrations
# ------------------------------------------------------------------------------
run_migrations() {
    if [ "$SKIP_MIGRATIONS" = true ]; then
        log_info "Skipping database migrations (--skip-migrations)."
        return 0
    fi

    log_header "2. Running Database Migrations"
    log_info "Synchronizing database schema via backend/database/run_migrations.js..."

    if [ -f "${ROOT_DIR}/backend/database/run_migrations.js" ]; then
        (cd "${ROOT_DIR}/backend" && node database/run_migrations.js >> "${LOG_DIR}/migrations.log" 2>&1)
        log_success "Database migrations executed successfully! (Logs: logs/migrations.log)"
    else
        log_warn "Migration runner not found at backend/database/run_migrations.js"
    fi
}

# ------------------------------------------------------------------------------
# 3. Start Node.js API Gateway (Port 4000)
# ------------------------------------------------------------------------------
start_backend() {
    log_header "3. Starting Node.js API Gateway"

    # Check if backend already running
    if [ -f "${BACKEND_PID_FILE}" ]; then
        local existing_pid
        existing_pid="$(cat "${BACKEND_PID_FILE}" 2>/dev/null || true)"
        if is_pid_running "${existing_pid}"; then
            log_warn "Node.js API Gateway is already running (PID: ${existing_pid})."
            return 0
        fi
    fi

    if is_port_in_use 4000; then
        log_warn "Port 4000 is already in use. Attempting to verify health..."
        if curl -s -f http://localhost:4000/health &>/dev/null; then
            log_success "An active API Gateway is already responding on port 4000."
            return 0
        else
            log_warn "Port 4000 is bound by an unresponsive process. Please stop it or check logs."
        fi
    fi

    # Ensure dependencies are installed
    if [ ! -d "${ROOT_DIR}/backend/node_modules" ]; then
        log_info "Installing backend dependencies (npm install)..."
        (cd "${ROOT_DIR}/backend" && npm install >> "${LOG_DIR}/backend_install.log" 2>&1)
    fi

    log_info "Starting API Gateway on port 4000 (logging to logs/backend.log)..."
    (
        cd "${ROOT_DIR}/backend"
        setsid node src/index.js >> "${LOG_DIR}/backend.log" 2>&1 < /dev/null &
        echo $! > "${BACKEND_PID_FILE}"
    )

    local backend_pid
    backend_pid="$(cat "${BACKEND_PID_FILE}")"
    log_info "API Gateway process launched with PID: ${backend_pid}"

    # Health polling
    log_info "Waiting for API Gateway to respond on http://localhost:4000/health..."
    local healthy=false
    for i in {1..30}; do
        if curl -s -f http://localhost:4000/health &>/dev/null; then
            healthy=true
            break
        fi
        if ! is_pid_running "${backend_pid}"; then
            log_error "API Gateway process exited prematurely. Check logs/backend.log for errors."
            exit 1
        fi
        sleep 1
    done

    if [ "$healthy" = true ]; then
        log_success "Node.js API Gateway is healthy on port 4000!"
    else
        log_error "API Gateway health check timed out. Inspect logs/backend.log for details."
    fi
}

# ------------------------------------------------------------------------------
# 4. Start Python FastAPI Agent Service (Port 8000)
# ------------------------------------------------------------------------------
start_agent() {
    log_header "4. Starting Python FastAPI Agent Microservice"

    # Check if agent already running
    if [ -f "${AGENT_PID_FILE}" ]; then
        local existing_pid
        existing_pid="$(cat "${AGENT_PID_FILE}" 2>/dev/null || true)"
        if is_pid_running "${existing_pid}"; then
            log_warn "Python Agent Microservice is already running (PID: ${existing_pid})."
            return 0
        fi
    fi

    if is_port_in_use 8000; then
        log_warn "Port 8000 is already in use. Attempting to verify health..."
        if curl -s -f http://localhost:8000/health &>/dev/null; then
            log_success "An active Agent Microservice is already responding on port 8000."
            return 0
        else
            log_warn "Port 8000 is bound by an unresponsive process."
        fi
    fi

    log_info "Starting FastAPI Agent on port 8000 (logging to logs/agent.log)..."
    (
        cd "${ROOT_DIR}/agent"
        setsid "${VENV_UVICORN}" main:app --host 0.0.0.0 --port 8000 --reload >> "${LOG_DIR}/agent.log" 2>&1 < /dev/null &
        echo $! > "${AGENT_PID_FILE}"
    )

    local agent_pid
    agent_pid="$(cat "${AGENT_PID_FILE}")"
    log_info "Agent service process launched with PID: ${agent_pid}"

    # Health polling
    log_info "Waiting for Agent service to respond on http://localhost:8000/health..."
    local healthy=false
    for i in {1..35}; do
        if curl -s -f http://localhost:8000/health &>/dev/null; then
            healthy=true
            break
        fi
        if ! is_pid_running "${agent_pid}"; then
            log_error "Agent service process exited prematurely. Check logs/agent.log for errors."
            exit 1
        fi
        sleep 1
    done

    if [ "$healthy" = true ]; then
        log_success "Python Agent Microservice is healthy on port 8000!"
    else
        log_error "Agent service health check timed out. Inspect logs/agent.log for details."
    fi
}

# ------------------------------------------------------------------------------
# 5. Optional: Start Frontend (Port 3000)
# ------------------------------------------------------------------------------
start_frontend() {
    log_header "5. Starting Next.js Frontend"

    if [ -f "${FRONTEND_PID_FILE}" ]; then
        local existing_pid
        existing_pid="$(cat "${FRONTEND_PID_FILE}" 2>/dev/null || true)"
        if is_pid_running "${existing_pid}"; then
            log_warn "Frontend is already running (PID: ${existing_pid})."
            return 0
        fi
    fi

    if [ ! -d "${ROOT_DIR}/frontend/node_modules" ]; then
        log_info "Installing frontend dependencies (npm install)..."
        (cd "${ROOT_DIR}/frontend" && npm install >> "${LOG_DIR}/frontend_install.log" 2>&1)
    fi

    log_info "Starting Next.js Frontend on port 3000 (logging to logs/frontend.log)..."
    (
        cd "${ROOT_DIR}/frontend"
        setsid npm run dev >> "${LOG_DIR}/frontend.log" 2>&1 < /dev/null &
        echo $! > "${FRONTEND_PID_FILE}"
    )

    local frontend_pid
    frontend_pid="$(cat "${FRONTEND_PID_FILE}")"
    log_info "Frontend process launched with PID: ${frontend_pid}"
}

# ------------------------------------------------------------------------------
# Show Status Summary
# ------------------------------------------------------------------------------
show_status() {
    log_header "Enterprise AI Platform Status"

    echo -e "${BOLD}Databases & Infrastructure (Docker):${NC}"
    docker ps --filter "name=ai_platform_" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    echo ""

    echo -e "${BOLD}Backend Services:${NC}"
    local b_pid a_pid f_pid

    b_pid="$(cat "${BACKEND_PID_FILE}" 2>/dev/null || echo "")"
    if is_pid_running "$b_pid"; then
        echo -e "  • Node.js API Gateway:      ${GREEN}RUNNING${NC} (PID: ${b_pid}, Port: 4000) -> http://localhost:4000/health"
    else
        if curl -s -f http://localhost:4000/health &>/dev/null; then
            echo -e "  • Node.js API Gateway:      ${GREEN}RUNNING${NC} (Port: 4000, external PID) -> http://localhost:4000/health"
        else
            echo -e "  • Node.js API Gateway:      ${RED}STOPPED${NC} (Port: 4000)"
        fi
    fi

    a_pid="$(cat "${AGENT_PID_FILE}" 2>/dev/null || echo "")"
    if is_pid_running "$a_pid"; then
        echo -e "  • Python FastAPI Agent:     ${GREEN}RUNNING${NC} (PID: ${a_pid}, Port: 8000) -> http://localhost:8000/health | Docs: http://localhost:8000/docs"
    else
        if curl -s -f http://localhost:8000/health &>/dev/null; then
            echo -e "  • Python FastAPI Agent:     ${GREEN}RUNNING${NC} (Port: 8000, external PID) -> http://localhost:8000/health"
        else
            echo -e "  • Python FastAPI Agent:     ${RED}STOPPED${NC} (Port: 8000)"
        fi
    fi

    f_pid="$(cat "${FRONTEND_PID_FILE}" 2>/dev/null || echo "")"
    if is_pid_running "$f_pid"; then
        echo -e "  • Next.js Frontend:         ${GREEN}RUNNING${NC} (PID: ${f_pid}, Port: 3000) -> http://localhost:3000"
    else
        if curl -s -f http://localhost:3000 &>/dev/null; then
            echo -e "  • Next.js Frontend:         ${GREEN}RUNNING${NC} (Port: 3000, external PID) -> http://localhost:3000"
        else
            echo -e "  • Next.js Frontend:         ${YELLOW}STOPPED${NC} (Use --with-frontend to start)"
        fi
    fi

    echo -e "\n${BOLD}Service Endpoints:${NC}"
    echo -e "  • API Gateway:     ${CYAN}http://localhost:4000${NC}"
    echo -e "  • Agent API:       ${CYAN}http://localhost:8000${NC} (Swagger UI: ${CYAN}http://localhost:8000/docs${NC})"
    echo -e "  • Qdrant Web UI:   ${CYAN}http://localhost:6333/dashboard${NC}"
    echo -e "  • PostgreSQL:      ${CYAN}localhost:5432${NC} (DB: ai_platform)"
    echo -e "  • Redis:           ${CYAN}localhost:6379${NC}"
    if [ "$WITH_FRONTEND" = true ] || is_pid_running "$f_pid"; then
        echo -e "  • Web Frontend:    ${CYAN}http://localhost:3000${NC}"
    fi

    echo -e "\n${BOLD}Log Files:${NC}"
    echo -e "  • Backend logs:    ${ROOT_DIR}/logs/backend.log"
    echo -e "  • Agent logs:      ${ROOT_DIR}/logs/agent.log"
    echo -e "  • Migrations log:  ${ROOT_DIR}/logs/migrations.log"
    if [ "$WITH_FRONTEND" = true ] || is_pid_running "$f_pid"; then
        echo -e "  • Frontend logs:   ${ROOT_DIR}/logs/frontend.log"
    fi
    echo ""
}

# ------------------------------------------------------------------------------
# Graceful Teardown Handler (for Foreground mode)
# ------------------------------------------------------------------------------
cleanup_and_exit() {
    echo -e "\n\n${YELLOW}[SHUTDOWN] Intercepted interrupt. Stopping backend services...${NC}"
    if [ -f "${ROOT_DIR}/stop.sh" ]; then
        "${ROOT_DIR}/stop.sh"
    else
        local b_pid a_pid f_pid
        b_pid="$(cat "${BACKEND_PID_FILE}" 2>/dev/null || true)"
        a_pid="$(cat "${AGENT_PID_FILE}" 2>/dev/null || true)"
        f_pid="$(cat "${FRONTEND_PID_FILE}" 2>/dev/null || true)"

        [ -n "$b_pid" ] && kill -TERM "$b_pid" 2>/dev/null || true
        [ -n "$a_pid" ] && kill -TERM "$a_pid" 2>/dev/null || true
        [ -n "$f_pid" ] && kill -TERM "$f_pid" 2>/dev/null || true
        rm -f "${BACKEND_PID_FILE}" "${AGENT_PID_FILE}" "${FRONTEND_PID_FILE}"
    fi
    log_success "All backend services stopped."
    exit 0
}

# ------------------------------------------------------------------------------
# CLI Argument Parsing
# ------------------------------------------------------------------------------
case "${1:-}" in
    status)
        show_status
        exit 0
        ;;
    stop)
        if [ -f "${ROOT_DIR}/stop.sh" ]; then
            exec "${ROOT_DIR}/stop.sh" "${@:2}"
        else
            log_error "stop.sh not found."
            exit 1
        fi
        ;;
    restart)
        if [ -f "${ROOT_DIR}/stop.sh" ]; then
            "${ROOT_DIR}/stop.sh"
        fi
        sleep 2
        exec "$0" "${@:2}"
        ;;
esac

while [ $# -gt 0 ]; do
    case "$1" in
        --foreground|-f)
            FOREGROUND=true
            shift
            ;;
        --with-frontend|--all)
            WITH_FRONTEND=true
            shift
            ;;
        --skip-migrations)
            SKIP_MIGRATIONS=true
            shift
            ;;
        --help|-h)
            echo "Usage: ./start.sh [OPTIONS] | [COMMAND]"
            echo ""
            echo "Commands:"
            echo "  status            Check live status of databases and backend services"
            echo "  stop [--all]      Stop running backends (and docker containers with --all)"
            echo "  restart           Restart backend services"
            echo ""
            echo "Options:"
            echo "  -f, --foreground       Run script in foreground and stop backends on Ctrl+C"
            echo "  --with-frontend, --all Also launch the Next.js frontend (port 3000)"
            echo "  --skip-migrations      Skip running database migrations"
            echo "  -h, --help             Show this help message"
            exit 0
            ;;
        *)
            log_warn "Unknown option '$1'. Ignoring."
            shift
            ;;
    esac
done

# ------------------------------------------------------------------------------
# Execution Flow
# ------------------------------------------------------------------------------
preflight_checks
start_databases
run_migrations
start_backend
start_agent

if [ "$WITH_FRONTEND" = true ]; then
    start_frontend
fi

show_status

if [ "$FOREGROUND" = true ]; then
    log_info "Running in foreground mode. Press Ctrl+C to stop backend services..."
    trap cleanup_and_exit SIGINT SIGTERM EXIT
    
    # Follow backend and agent logs
    tail -f "${LOG_DIR}/backend.log" "${LOG_DIR}/agent.log"
else
    echo -e "${GREEN}✨ All databases and backends are up and running!${NC}"
    echo -e "To view live logs:    ${CYAN}tail -f logs/backend.log logs/agent.log${NC}"
    echo -e "To check status:      ${CYAN}./start.sh status${NC}"
    echo -e "To stop services:     ${CYAN}./stop.sh${NC} (or ${CYAN}./stop.sh --all${NC} to include Docker)\n"
fi
