"""
AI Sales Agent (AI SDR/BDR) Multi-Agent Orchestrator Graph.

6-Stage Pipeline:
1. Business Understanding & Sourcing (Apollo API Account Query)
2. Account Fit Check (Crawl4AI Web Scraping)
3. Contact Discovery (Apollo Contact Search / Enrichment)
4. Deliverability Guard (Email Verifier Engine)
5. Scoring & Copy Generation (OpenRouter LLM)
6. Dispatch & CRM Logging (Gmail API & PostgreSQL)
"""
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from graph.sales.state import SalesAgentState
from graph.sales.nodes.business_understanding import business_understanding_node
from graph.sales.nodes.account_fit_research import account_fit_research_node
from graph.sales.nodes.contact_discovery import contact_discovery_node
from graph.sales.nodes.deliverability_guard import deliverability_guard_node
from graph.sales.nodes.scoring_copy_gen import scoring_copy_gen_node
from graph.sales.nodes.dispatch_closing import dispatch_closing_node


def build_sales_sdr_graph():
    builder = StateGraph(SalesAgentState)

    builder.add_node("business_understanding", business_understanding_node)
    builder.add_node("account_fit_research", account_fit_research_node)
    builder.add_node("contact_discovery", contact_discovery_node)
    builder.add_node("deliverability_guard", deliverability_guard_node)
    builder.add_node("scoring_copy_gen", scoring_copy_gen_node)
    builder.add_node("dispatch_closing", dispatch_closing_node)

    # Define Linear Execution Pipeline
    builder.add_edge(START, "business_understanding")
    builder.add_edge("business_understanding", "account_fit_research")
    builder.add_edge("account_fit_research", "contact_discovery")
    builder.add_edge("contact_discovery", "deliverability_guard")
    builder.add_edge("deliverability_guard", "scoring_copy_gen")
    builder.add_edge("scoring_copy_gen", "dispatch_closing")
    builder.add_edge("dispatch_closing", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


sales_head_graph = build_sales_sdr_graph()
