"""
Finance Head Multi-Agent Orchestrator Graph
"""
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from graph.finance.state import FinanceAgentState
from graph.finance.nodes.invoice_ingestion import invoice_ingestion_node
from graph.finance.nodes.invoice_reconciliation import invoice_reconciliation_node
from graph.finance.nodes.payment_execution import payment_execution_node
from graph.finance.nodes.budget_clearance import budget_clearance_node


def route_finance_subagent(state: FinanceAgentState) -> str:
    target = state.get("subagent_target", "invoice_ingestion")
    if target == "budget_clearance":
        return "budget_clearance"
    elif target == "payment_execution":
        return "payment_execution"
    elif target == "invoice_reconciliation":
        return "invoice_reconciliation"
    return "invoice_ingestion"


def route_after_ingestion(state: FinanceAgentState) -> str:
    # After ingestion, move automatically to reconciliation
    return "invoice_reconciliation"


def route_after_reconciliation(state: FinanceAgentState) -> str:
    # If approval decision is already available and approved, execute payment
    if state.get("approval_status") == "approved":
        return "payment_execution"
    return END


def build_finance_graph():
    builder = StateGraph(FinanceAgentState)

    builder.add_node("invoice_ingestion", invoice_ingestion_node)
    builder.add_node("invoice_reconciliation", invoice_reconciliation_node)
    builder.add_node("payment_execution", payment_execution_node)
    builder.add_node("budget_clearance", budget_clearance_node)

    builder.add_conditional_edges(
        START,
        route_finance_subagent,
        {
            "invoice_ingestion": "invoice_ingestion",
            "invoice_reconciliation": "invoice_reconciliation",
            "payment_execution": "payment_execution",
            "budget_clearance": "budget_clearance",
        }
    )

    builder.add_edge("invoice_ingestion", "invoice_reconciliation")
    builder.add_conditional_edges(
        "invoice_reconciliation",
        route_after_reconciliation,
        {"payment_execution": "payment_execution", END: END}
    )
    builder.add_edge("payment_execution", END)
    builder.add_edge("budget_clearance", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


finance_head_graph = build_finance_graph()
