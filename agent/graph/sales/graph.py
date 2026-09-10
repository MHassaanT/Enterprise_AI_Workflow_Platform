"""
AI Sales Agent (Autonomous WhatsApp SDR) Multi-Agent Orchestrator Graph.

5-Stage WhatsApp-Native Pipeline:
1. Places Discovery (Google Places API New + Serper Places Fallback)
2. Gemini Evaluation (gemini-2.5-flash ICP Qualification & Scoring — replaces Crawl4AI)
3. WhatsApp Deliverability Guard (Baileys onWhatsApp API Check)
4. Gemini Pitch Generation (Tailored WhatsApp Conversational Copywriter)
5. WhatsApp Dispatch & CRM Persistence (WhatsApp MCP & PostgreSQL Storage)
"""
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from graph.sales.state import SalesAgentState
from graph.sales.nodes.places_discovery import places_discovery_node
from graph.sales.nodes.gemini_evaluation import gemini_evaluation_node
from graph.sales.nodes.whatsapp_verifier import whatsapp_verifier_node
from graph.sales.nodes.gemini_pitch_generation import gemini_pitch_generation_node
from graph.sales.nodes.whatsapp_dispatch import whatsapp_dispatch_node


def build_sales_sdr_graph():
    builder = StateGraph(SalesAgentState)

    builder.add_node("places_discovery", places_discovery_node)
    builder.add_node("gemini_evaluation", gemini_evaluation_node)
    builder.add_node("whatsapp_verifier", whatsapp_verifier_node)
    builder.add_node("gemini_pitch_generation", gemini_pitch_generation_node)
    builder.add_node("whatsapp_dispatch", whatsapp_dispatch_node)

    # Define Linear Execution Pipeline
    builder.add_edge(START, "places_discovery")
    builder.add_edge("places_discovery", "gemini_evaluation")
    builder.add_edge("gemini_evaluation", "whatsapp_verifier")
    builder.add_edge("whatsapp_verifier", "gemini_pitch_generation")
    builder.add_edge("gemini_pitch_generation", "whatsapp_dispatch")
    builder.add_edge("whatsapp_dispatch", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


sales_head_graph = build_sales_sdr_graph()
