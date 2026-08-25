"""
Enterprise AI Agent Orchestration Service — Entry Point

Architecture:
  - FastAPI handles HTTP + auth
  - LangGraph (customer_support_graph) handles agent reasoning
  - FastMCP (mounted at /mcp) exposes tools via Streamable HTTP
  - All internal calls use X-Internal-Token (never exposed publicly)

Port: 8000 (internal only — API Gateway at :4000 proxies to this)
"""
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from tool_gateway.server import mcp
from routers.agent import router as agent_router
from routers.workflows import router as workflows_router
from routers.hr import router as hr_router
from routers.tools import router as tools_router
from routers.sales_agent import router as sales_router
from routers.procurement_agent import router as procurement_router
from routers.company_crawler import router as company_crawler_router
from routers.finance_agent import router as finance_router

# Build MCP HTTP app (Streamable HTTP transport)
mcp_http_app = mcp.http_app(path="/mcp")

from polling_engine import start_polling_engine
from hr_polling import start_hr_polling_engine
import asyncio
from contextlib import asynccontextmanager

import os
import subprocess

# Main app — lifespan from mcp_http_app for proper MCP session management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start polling engines
    polling_task = asyncio.create_task(start_polling_engine())
    hr_polling_task = asyncio.create_task(start_hr_polling_engine())
    
    # Delegate to MCP lifespan
    async with mcp_http_app.lifespan(app):
        yield
        
    polling_task.cancel()
    hr_polling_task.cancel()


app = FastAPI(
    title="Enterprise AI Agent Orchestration Service",
    description="LangGraph-powered multi-agent enterprise platform (Sales, HR, Customer Support)",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — Node.js API Gateway & external tools allowed
allowed_origins = [settings.BACKEND_URL, "http://localhost:4000", "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Agent orchestration routes
app.include_router(agent_router, prefix="/agent", tags=["Agent"])

# Multi-Agent Domain Routes
app.include_router(sales_router, prefix="/agent/sales", tags=["Sales Agent"])
app.include_router(procurement_router, tags=["Procurement Agent"])
app.include_router(finance_router, prefix="/agent/finance", tags=["Finance Agent"])

# Workflow Engine routes
app.include_router(workflows_router, prefix="/api/v1/workflows", tags=["Workflows"])

# HR routes
app.include_router(hr_router, prefix="/agent/hr", tags=["HR Agent"])

# Internal tools route
app.include_router(tools_router, prefix="/agent/tools", tags=["Tools"])
app.include_router(company_crawler_router, prefix="/agent", tags=["Company Crawler"])

# MCP gateway (external tool clients can connect here)
app.mount("/mcp", mcp_http_app)


@app.get("/health", tags=["Health"])
async def health():
    return {
        "status": "Agent orchestration service running",
        "llm_provider": settings.LLM_PROVIDER,
        "mcp_tools": ["check_order_status", "escalate_to_human"],
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True,
    )
