"""
Procurement Head Multi-Agent Orchestrator Graph
"""
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from graph.procurement.state import ProcurementAgentState
from graph.procurement.nodes.vendor_bid import vendor_bid_node
from graph.procurement.nodes.procurement_budget import procurement_budget_node
from graph.procurement.nodes.po_execution import po_execution_node


def route_procurement_subagent(state: ProcurementAgentState) -> str:
    target = state.get("subagent_target", "vendor_bid")
    if target == "procurement_budget":
        return "procurement_budget"
    elif target == "po_execution":
        return "po_execution"
    return "vendor_bid"


def build_procurement_graph():
    builder = StateGraph(ProcurementAgentState)

    builder.add_node("vendor_bid", vendor_bid_node)
    builder.add_node("procurement_budget", procurement_budget_node)
    builder.add_node("po_execution", po_execution_node)

    builder.add_conditional_edges(
        START,
        route_procurement_subagent,
        {
            "vendor_bid": "vendor_bid",
            "procurement_budget": "procurement_budget",
            "po_execution": "po_execution",
        }
    )

    builder.add_edge("vendor_bid", "procurement_budget")
    builder.add_edge("procurement_budget", "po_execution")
    builder.add_edge("po_execution", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


procurement_head_graph = build_procurement_graph()
