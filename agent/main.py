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

# Build MCP HTTP app (Streamable HTTP transport)
mcp_http_app = mcp.http_app(path="/mcp")

# Main app — lifespan from mcp_http_app for proper MCP session management
app = FastAPI(
    title="Enterprise AI Agent Orchestration Service",
    description="LangGraph-powered customer support agent with MCP tool integration",
    version="1.0.0",
    lifespan=mcp_http_app.lifespan,
)

# CORS — only Node.js API Gateway is allowed to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4000"],
    allow_credentials=True,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Agent orchestration routes
app.include_router(agent_router, prefix="/agent", tags=["Agent"])

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
