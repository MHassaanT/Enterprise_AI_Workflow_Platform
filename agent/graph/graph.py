"""
Customer Support Agent — LangGraph StateGraph with MemorySaver Checkpointer

Graph flow:
  START
    → intent_classifier  (FLARE: should we retrieve?)
    → retriever          (calls Node.js RAG; skips if needs_retrieval=False)
    → reasoning          (LLM decides: answer | tool_call)
    → [tool_call]  → approval_checkpoint (if high-risk) → tool_executor → reasoning (loop)
                   → tool_executor (if low-risk)        → reasoning (loop)
    → [respond]    → END
"""
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from graph.state import AgentState
from graph.nodes.intent_classifier import intent_classifier_node
from graph.nodes.retriever import retriever_node
from graph.nodes.reasoning import reasoning_node
from graph.nodes.approval_checkpoint import approval_checkpoint_node
from graph.nodes.tool_executor import tool_executor_node


def _route_after_reasoning(state: AgentState) -> str:
    next_step = state.get("next_step", "")
    if next_step == "tool_call":
        return "approval_checkpoint" if state.get("is_high_risk") else "tool_executor"
    return END


def _route_after_approval(state: AgentState) -> str:
    status = state.get("approval_status")
    if status == "approved":
        return "tool_executor"
    return END


def build_graph():
    builder = StateGraph(AgentState)

    builder.add_node("intent_classifier", intent_classifier_node)
    builder.add_node("retriever", retriever_node)
    builder.add_node("reasoning", reasoning_node)
    builder.add_node("approval_checkpoint", approval_checkpoint_node)
    builder.add_node("tool_executor", tool_executor_node)

    builder.add_edge(START, "intent_classifier")
    builder.add_edge("intent_classifier", "retriever")
    builder.add_edge("retriever", "reasoning")

    builder.add_conditional_edges(
        "reasoning",
        _route_after_reasoning,
        {"approval_checkpoint": "approval_checkpoint", "tool_executor": "tool_executor", END: END},
    )
    builder.add_conditional_edges(
        "approval_checkpoint",
        _route_after_approval,
        {"tool_executor": "tool_executor", END: END},
    )

    # ReAct loop — tool result feeds back into reasoning
    builder.add_edge("tool_executor", "reasoning")

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


# Compiled once at import time with checkpointer
customer_support_graph = build_graph()
