"""
Supervisor Multi-Agent Central Orchestrator Graph
"""
from typing import Dict, Any
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from graph.supervisor.state import SupervisorState
from graph.sales.graph import sales_head_graph


async def route_sales_node(state: SupervisorState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    conv_id = state.get("conversation_id", "conv-sup")
    payload = state.get("payload") or {}
    
    sales_input = {
        "tenant_id": tenant_id,
        "run_id": f"{conv_id}-sales",
        "user_id": "supervisor_graph",
        "target_domain": payload.get("target_domain"),
        "icp_config": payload.get("icp_config") or {},
        "raw_accounts": [],
        "scraped_context": {},
        "account_fit_passed": True,
        "discovered_contact": None,
        "deliverability_result": None,
        "icp_score": 0.0,
        "generated_outreach": None,
        "outreach_sent": False,
        "gmail_message_id": None,
        "deal_stage": "DISCOVERED",
        "quote_details": None,
        "logs": [],
        "answer": "",
    }
    
    sales_res = await sales_head_graph.ainvoke(sales_input, config={"configurable": {"thread_id": f"{conv_id}-sales"}})
    history = state.get("route_history", []) + ["Supervisor -> SalesHead"]
    return {
        "result": sales_res,
        "answer": sales_res.get("answer", "Sales SDR operation completed."),
        "route_history": history
    }


def route_domain(state: SupervisorState) -> str:
    return "sales"


def build_supervisor_graph():
    builder = StateGraph(SupervisorState)

    builder.add_node("sales", route_sales_node)

    builder.add_conditional_edges(
        START,
        route_domain,
        {
            "sales": "sales",
        }
    )

    builder.add_edge("sales", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


supervisor_graph = build_supervisor_graph()

