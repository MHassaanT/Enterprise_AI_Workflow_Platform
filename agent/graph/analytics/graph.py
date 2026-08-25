"""
Analytics Agent LangGraph Assembly

Routes execution based on intent:
- 'quickview': supervisor -> quickview_node -> END
- 'executive_digest': supervisor -> digest_node -> END
- 'text_to_sql': supervisor -> sql_generator_node -> executor_node -> visualizer_node -> END
"""

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from graph.analytics.state import AnalyticsAgentState
from graph.analytics.nodes import (
    supervisor_node,
    quickview_node,
    sql_generator_node,
    executor_node,
    visualizer_node,
    digest_node
)

def _route_intent(state: AnalyticsAgentState) -> str:
    intent = state.get("intent", "text_to_sql")
    if intent == "quickview":
        return "quickview"
    elif intent == "executive_digest":
        return "digest"
    return "sql_generator"

def build_analytics_graph():
    builder = StateGraph(AnalyticsAgentState)

    builder.add_node("supervisor", supervisor_node)
    builder.add_node("quickview", quickview_node)
    builder.add_node("sql_generator", sql_generator_node)
    builder.add_node("executor", executor_node)
    builder.add_node("visualizer", visualizer_node)
    builder.add_node("digest", digest_node)

    builder.add_edge(START, "supervisor")

    builder.add_conditional_edges(
        "supervisor",
        _route_intent,
        {
            "quickview": "quickview",
            "digest": "digest",
            "sql_generator": "sql_generator"
        }
    )

    builder.add_edge("quickview", END)
    builder.add_edge("digest", END)

    builder.add_edge("sql_generator", "executor")
    builder.add_edge("executor", "visualizer")
    builder.add_edge("visualizer", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)

analytics_agent_graph = build_analytics_graph()
