from typing import Annotated, Optional
from typing_extensions import TypedDict
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    # Conversation history — append-only via add_messages reducer
    messages: Annotated[list[BaseMessage], add_messages]

    # RAG results populated by the retriever node
    context: list[dict]       # [{text, documentName, section, page, score}, ...]
    citations: list[dict]     # structured for citations_json in messages table

    # Routing signals
    needs_retrieval: bool     # set by intent_classifier (FLARE-style skip gate)
    next_step: str            # "tool_call" | "respond" | ""

    # Tool invocation payload
    pending_tool_call: Optional[dict]   # {name, arguments}
    tool_result: Optional[str]          # raw result from last tool execution
    is_high_risk: bool                  # whether pending tool requires human approval
    tool_retry_count: int               # circuit breaker: counts consecutive tool failures
    tool_call_count: int                # per-turn tool call budget tracker

    # Approval tracking
    approval_id: Optional[str]          # UUID of the pending ApprovalRequest
    approval_status: Optional[str]      # "pending" | "approved" | "rejected"

    # Tenant context — dynamic entity schema + agent configuration
    tenant_context: Optional[dict]      # {agent_context, entities, company}

    # Request-scoped metadata (immutable after initialization)
    tenant_id: str
    agent_instance_id: str    # used for ToolBinding allowlist enforcement
    conversation_id: str
    question: str
    user_id: str
