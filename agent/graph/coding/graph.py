"""
Coding Agent LangGraph Assembly

Routes execution between plan building mode vs automated execution (branching -> editing -> PR creation).
"""

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from graph.coding.state import CodingAgentState
from graph.coding.nodes import (
    planner_node,
    branch_node,
    code_editor_node,
    pr_creator_node
)

def _route_initial(state: CodingAgentState) -> str:
    if state.get("plan_mode", False) and state.get("status") != "executing":
        return "planner"
    return "branch"

def build_coding_graph():
    builder = StateGraph(CodingAgentState)

    builder.add_node("planner", planner_node)
    builder.add_node("branch", branch_node)
    builder.add_node("code_editor", code_editor_node)
    builder.add_node("pr_creator", pr_creator_node)

    builder.add_conditional_edges(
        START,
        _route_initial,
        {"planner": "planner", "branch": "branch"}
    )

    builder.add_edge("planner", END)
    builder.add_edge("branch", "code_editor")
    builder.add_edge("code_editor", "pr_creator")
    builder.add_edge("pr_creator", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)

coding_agent_graph = build_coding_graph()
