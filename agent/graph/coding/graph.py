"""
Coding Agent LangGraph Assembly

Routes execution between:
1. Plan building mode (planner → END)
2. Automated execution (branch → code_editor → pr_creator → END)
3. Issue investigation mode (issue_investigator → issue_approval_creator → END)
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
from graph.coding.issue_investigator import issue_investigator_node
from graph.coding.issue_approval_creator import issue_approval_creator_node


def _route_initial(state: CodingAgentState) -> str:
    # Issue investigation mode: route to investigator
    if state.get("issue_investigation_mode", False):
        return "issue_investigator"
    # Plan building mode
    if state.get("plan_mode", False) and state.get("status") != "executing":
        return "planner"
    # Execution mode
    return "branch"


def build_coding_graph():
    builder = StateGraph(CodingAgentState)

    # Existing nodes
    builder.add_node("planner", planner_node)
    builder.add_node("branch", branch_node)
    builder.add_node("code_editor", code_editor_node)
    builder.add_node("pr_creator", pr_creator_node)

    # Issue investigation nodes
    builder.add_node("issue_investigator", issue_investigator_node)
    builder.add_node("issue_approval_creator", issue_approval_creator_node)

    # Conditional routing from START
    builder.add_conditional_edges(
        START,
        _route_initial,
        {"planner": "planner", "branch": "branch", "issue_investigator": "issue_investigator"}
    )

    # Existing edges
    builder.add_edge("planner", END)
    builder.add_edge("branch", "code_editor")
    builder.add_edge("code_editor", "pr_creator")
    builder.add_edge("pr_creator", END)

    # Issue investigation edges
    builder.add_edge("issue_investigator", "issue_approval_creator")
    builder.add_edge("issue_approval_creator", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


coding_agent_graph = build_coding_graph()
