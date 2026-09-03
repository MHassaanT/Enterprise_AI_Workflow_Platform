"""
Agent Router — POST /agent/run & POST /agent/resume

Called internally by the Node.js API Gateway. Never exposed publicly.
Authenticated via X-Internal-Token header (shared secret).
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from langchain_core.messages import HumanMessage, AIMessage

from config import settings
from graph.graph import customer_support_graph
from graph.state import AgentState
from services.agent_context_client import get_tenant_agent_context

router = APIRouter()


class AgentRunRequest(BaseModel):
    question: str
    tenant_id: str
    agent_instance_id: str
    conversation_id: str
    user_id: str = "anonymous"
    history: Optional[list[dict]] = None


class AgentResumeRequest(BaseModel):
    approval_id: str
    conversation_id: str
    decision: str  # "approved" or "rejected"
    tenant_id: str
    user_id: str = "reviewer"


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

    # Fetch dynamic tenant context (entities, agent config, company info)
    tenant_context = await get_tenant_agent_context(request.tenant_id)

    # Reconstruct conversation history memory from past turns, filtering out previous fallback refusal loops
    messages_list = []
    if request.history:
        for msg in request.history:
            role = msg.get("role")
            text = msg.get("content", "")
            if role == "user":
                messages_list.append(HumanMessage(content=text))
            elif role == "assistant":
                # Skip legacy refusal / fallback messages from previous failed attempts
                # to prevent the LLM from seeing past refusals and reinforcing them
                _lower = text.lower()
                REFUSAL_PATTERNS = [
                    "cannot assist with", "unable to process your request",
                    "don't have the ability", "not able to",
                    "i cannot help with", "i'm unable to",
                    "i don't have access to", "cannot look up",
                    "cannot check", "i can't assist",
                    "i'm not able to help", "i do not have access",
                    "unable to assist", "beyond my capabilities",
                ]
                if any(pat in _lower for pat in REFUSAL_PATTERNS):
                    continue
                messages_list.append(AIMessage(content=text))

    # Append current question if not already the last message
    if not messages_list or getattr(messages_list[-1], "content", "") != request.question:
        messages_list.append(HumanMessage(content=request.question))

    initial_state: AgentState = {
        "messages": messages_list,
        "context": [],
        "citations": [],
        "needs_retrieval": True,
        "next_step": "",
        "pending_tool_call": None,
        "tool_result": None,
        "is_high_risk": False,
        "approval_id": None,
        "approval_status": None,
        "tenant_context": tenant_context,
        "tenant_id": request.tenant_id,
        "agent_instance_id": request.agent_instance_id,
        "conversation_id": request.conversation_id,
        "question": request.question,
        "user_id": request.user_id,
        "tool_retry_count": 0,
        "tool_call_count": 0,
    }

    config = {"configurable": {"thread_id": request.conversation_id}}

    try:
        final_state = await customer_support_graph.ainvoke(initial_state, config=config)

        if final_state.get("approval_status") == "pending":
            answer = final_state["messages"][-1].content
        else:
            # Extract last AI message as the answer
            ai_msgs = [m for m in final_state["messages"] if getattr(m, "type", "") == "ai"]
            answer = ai_msgs[-1].content if ai_msgs else "Unable to process your request."

        # Determine which tool was used (if any)
        tool_msgs = [m for m in final_state["messages"] if getattr(m, "type", "") == "tool"]
        tool_used = tool_msgs[-1].tool_call_id if tool_msgs else None

        return AgentRunResponse(
            answer=answer if isinstance(answer, str) else str(answer),
            citations=final_state.get("citations", []),
            tool_used=tool_used,
            approval_pending=final_state.get("approval_status") == "pending",
            approval_id=final_state.get("approval_id"),
        )
    except Exception as e:
        import traceback
        print(f"[AGENT FATAL] Graph execution failed: {e}")
        traceback.print_exc()

        # RAG-only fallback — try to answer from documents
        from services.rag_client import query_rag
        rag_result = await query_rag(request.question, request.tenant_id)
        chunks = rag_result.get("chunks", [])
        if chunks:
            top_text = chunks[0].get("text", "").replace("\n", " ").strip()
            answer = top_text[:300] + ("..." if len(top_text) > 300 else "")
        else:
            answer = "I'm not sure how to help with that. Could you provide more details about your issue?"

        return AgentRunResponse(
            answer=answer,
            citations=rag_result.get("citations", []),
            tool_used=None,
            approval_pending=False,
            approval_id=None,
        )


@router.post("/resume", response_model=AgentRunResponse)
async def resume_agent(
    request: AgentResumeRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    config = {"configurable": {"thread_id": request.conversation_id}}

    try:
        existing_state = await customer_support_graph.aget_state(config)
        prior_messages = existing_state.values.get("messages", []) if existing_state else []

        existing_values = existing_state.values if existing_state else {}
        resume_update = {
            "approval_status": request.decision,
            "approval_id": request.approval_id,
            "question": "SYSTEM NOTIFICATION",
            "agent_instance_id": existing_values.get("agent_instance_id") or "default",
            "tenant_id": request.tenant_id or existing_values.get("tenant_id") or "",
            "conversation_id": request.conversation_id,
            "tenant_context": existing_values.get("tenant_context", {}),
        }

        # Generic notification — no hardcoded refund/Gmail logic
        if request.decision == "rejected":
            notification = (
                f"SYSTEM NOTIFICATION: Action (Ref: {request.approval_id}) was REJECTED by human reviewer. "
                f"Inform the user politely and offer alternatives or escalation."
            )
        else:
            notification = (
                f"SYSTEM NOTIFICATION: Action (Ref: {request.approval_id}) was APPROVED by human reviewer. "
                f"Proceed with confirming the result to the user."
            )

        resume_update["messages"] = prior_messages + [HumanMessage(content=notification)]

        final_state = await customer_support_graph.ainvoke(resume_update, config=config)

        ai_msgs = [m for m in final_state["messages"] if getattr(m, "type", "") == "ai"]
        answer = ai_msgs[-1].content if ai_msgs else f"Action {request.decision} by reviewer."

        tool_msgs = [m for m in final_state["messages"] if getattr(m, "type", "") == "tool"]
        tool_used = tool_msgs[-1].tool_call_id if tool_msgs else None

        return AgentRunResponse(
            answer=answer if isinstance(answer, str) else str(answer),
            citations=final_state.get("citations", []),
            tool_used=tool_used,
            approval_pending=False,
            approval_id=request.approval_id,
        )
    except Exception as e:
        print(f"Error resuming agent graph: {e}")
        return AgentRunResponse(
            answer=f"Agent workflow resumed with decision: {request.decision}.",
            citations=[],
            tool_used=None,
            approval_pending=False,
            approval_id=request.approval_id,
        )
