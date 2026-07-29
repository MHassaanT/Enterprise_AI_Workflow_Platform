"""
Agent Router — POST /agent/run

Called internally by the Node.js API Gateway. Never exposed publicly.
Authenticated via X-Internal-Token header (shared secret).
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from langchain_core.messages import HumanMessage

from config import settings
from graph.graph import customer_support_graph
from graph.state import AgentState

router = APIRouter()


class AgentRunRequest(BaseModel):
    question: str
    tenant_id: str
    agent_instance_id: str
    conversation_id: str
    user_id: str = "anonymous"


class AgentRunResponse(BaseModel):
    answer: str
    citations: list[dict]
    tool_used: Optional[str] = None
    approval_pending: bool = False
    approval_id: Optional[str] = None


@router.post("/run", response_model=AgentRunResponse)
async def run_agent(
    request: AgentRunRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    initial_state: AgentState = {
        "messages": [HumanMessage(content=request.question)],
        "context": [],
        "citations": [],
        "needs_retrieval": True,
        "next_step": "",
        "pending_tool_call": None,
        "tool_result": None,
        "is_high_risk": False,
        "approval_id": None,
        "approval_status": None,
        "tenant_id": request.tenant_id,
        "agent_instance_id": request.agent_instance_id,
        "conversation_id": request.conversation_id,
        "question": request.question,
        "user_id": request.user_id,
    }

    final_state = await customer_support_graph.ainvoke(initial_state)

    # Extract last AI message as the answer
    ai_msgs = [m for m in final_state["messages"] if getattr(m, "type", "") == "ai"]
    answer = ai_msgs[-1].content if ai_msgs else "Unable to process your request."

    # Determine which tool was used (if any)
    tool_msgs = [m for m in final_state["messages"] if getattr(m, "type", "") == "tool"]
    tool_used = tool_msgs[-1].tool_call_id if tool_msgs else None

    return AgentRunResponse(
        answer=answer,
        citations=final_state.get("citations", []),
        tool_used=tool_used,
        approval_pending=final_state.get("approval_status") == "pending",
        approval_id=final_state.get("approval_id"),
    )
