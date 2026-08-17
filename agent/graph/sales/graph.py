"""
Sales Head Multi-Agent Orchestrator Graph
"""
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from graph.sales.state import SalesAgentState
from graph.sales.nodes.lead_pricing import lead_pricing_node
from graph.sales.nodes.deal_negotiation import deal_negotiation_node
from graph.sales.nodes.sales_financial_sync import sales_financial_sync_node


def route_sales_subagent(state: SalesAgentState) -> str:
    target = state.get("subagent_target", "lead_pricing")
    if target == "deal_negotiation":
        return "deal_negotiation"
    elif target == "sales_financial_sync":
        return "sales_financial_sync"
    return "lead_pricing"


def build_sales_graph():
    builder = StateGraph(SalesAgentState)

    builder.add_node("lead_pricing", lead_pricing_node)
    builder.add_node("deal_negotiation", deal_negotiation_node)
    builder.add_node("sales_financial_sync", sales_financial_sync_node)

    builder.add_conditional_edges(
        START,
        route_sales_subagent,
        {
            "lead_pricing": "lead_pricing",
            "deal_negotiation": "deal_negotiation",
            "sales_financial_sync": "sales_financial_sync",
        }
    )

    builder.add_edge("lead_pricing", "deal_negotiation")
    builder.add_edge("deal_negotiation", "sales_financial_sync")
    builder.add_edge("sales_financial_sync", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


sales_head_graph = build_sales_graph()
