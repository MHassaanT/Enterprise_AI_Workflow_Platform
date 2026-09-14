#!/usr/bin/env bash

# ==============================================================================
# Enterprise AI Workflow Platform — Teardown & Service Stop Script
#
# Usage:
#   ./stop.sh          # Stop running Node.js API Gateway & Python Agent service
#   ./stop.sh --all    # Stop backends AND stop Docker containers (Postgres, Qdrant, Redis)
# ==============================================================================

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="${SCRIPT_DIR}"

RUN_DIR="${ROOT_DIR}/.run"
BACKEND_PID_FILE="${RUN_DIR}/backend.pid"
AGENT_PID_FILE="${RUN_DIR}/agent.pid"
FRONTEND_PID_FILE="${RUN_DIR}/frontend.pid"

# Colors
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
NC="\033[0m"

STOP_DOCKER=false

while [ $# -gt 0 ]; do
    case "$1" in
        --all|-a)
            STOP_DOCKER=true
            shift
            ;;
        --help|-h)
            echo "Usage: ./stop.sh [--all]"
            echo ""
            echo "Options:"
            echo "  --all, -a    Also stop Docker infrastructure containers (PostgreSQL, Qdrant, Redis)"
            echo "  -h, --help   Show this help message"
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# Kill process gracefully with timeout fallback
kill_process() {
    local name="$1"
    local pid_file="$2"
    local port="$3"

    if [ -f "$pid_file" ]; then
        local pid
        pid="$(cat "$pid_file" 2>/dev/null || true)"
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}[STOPPING]${NC} Terminating ${name} (PID: ${pid})..."
            kill -TERM -- -"$pid" 2>/dev/null || true
            kill -TERM "$pid" 2>/dev/null || true

            local waited=0
            while kill -0 "$pid" 2>/dev/null && [ $waited -lt 5 ]; do
                sleep 1
                waited=$((waited + 1))
            done

            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${RED}[FORCE KILL]${NC} ${name} (PID: ${pid}) did not stop gracefully; killing -9..."
                kill -9 -- -"$pid" 2>/dev/null || true
                kill -9 "$pid" 2>/dev/null || true
            fi
            echo -e "${GREEN}[STOPPED]${NC} ${name} stopped."
        else
            echo -e "${CYAN}[INFO]${NC} ${name} was not running with recorded PID."
        fi
        rm -f "$pid_file"
    fi

    # Check if port is still bound and cleanup
    if [ -n "$port" ]; then
        if command -v fuser &>/dev/null; then
            if fuser "${port}/tcp" &>/dev/null; then
                echo -e "${YELLOW}[CLEANUP]${NC} Freeing port ${port}..."
                fuser -k "${port}/tcp" &>/dev/null || true
            fi
        elif command -v lsof &>/dev/null; then
            local port_pids
            port_pids="$(lsof -ti ":${port}" 2>/dev/null || true)"
            if [ -n "$port_pids" ]; then
                echo -e "${YELLOW}[CLEANUP]${NC} Freeing port ${port} (PID(s): ${port_pids})..."
                echo "$port_pids" | xargs kill -9 2>/dev/null || true
            fi
        fi
    fi
}

echo -e "\n${BOLD}${CYAN}================================================================${NC}"
echo -e "${BOLD}${CYAN}  Stopping Enterprise AI Services${NC}"
echo -e "${BOLD}${CYAN}================================================================${NC}\n"

kill_process "Node.js API Gateway" "${BACKEND_PID_FILE}" "4000"
kill_process "Python FastAPI Agent Service" "${AGENT_PID_FILE}" "8000"
kill_process "Next.js Frontend" "${FRONTEND_PID_FILE}" "3000"

# Stop Docker if requested
if [ "$STOP_DOCKER" = true ]; then
    echo -e "\n${YELLOW}[STOPPING]${NC} Stopping Docker infrastructure containers..."
    if docker compose version &> /dev/null; then
        (cd "${ROOT_DIR}" && docker compose stop)
    elif docker-compose version &> /dev/null; then
        (cd "${ROOT_DIR}" && docker-compose stop)
    fi
    echo -e "${GREEN}[STOPPED]${NC} Docker containers stopped."
else
    echo -e "\n${CYAN}[NOTE]${NC} Docker databases (PostgreSQL, Qdrant, Redis) are still running."
    echo -e "       To stop them as well, run: ${BOLD}./stop.sh --all${NC}"
fi

echo -e "\n${GREEN}✨ Teardown complete.${NC}\n"
