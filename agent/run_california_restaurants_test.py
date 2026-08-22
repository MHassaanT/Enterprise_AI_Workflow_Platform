"""
Live Campaign Execution Script — California, USA Restaurant SME ICP.
Tests the autonomous 6-stage Sales Agent pipeline to find 2+ verified prospects with deliverable email addresses.

ICP:
- Industry: Restruants (SME)
- Prospect's Company Size: 100 max
- Region: California, USA
- Our Details: Software development company providing business/management & IT solutions to make businesses work faster and more efficient.
"""
import sys
import os
import time
import asyncio
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger("california_restaurants_test")

# Enforce agent directory in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))


async def run_california_campaign():
    from graph.sales.graph import sales_head_graph

    run_id = f"california-restaurants-2valid-{int(time.time())}"
    tenant_id = "00000000-0000-0000-0000-000000000000"

    icp_config = {
        "target_industries": ["Restruants", "Restaurant", "Dining Group", "Food Hospitality", "Catering"],
        "target_titles": ["Owner", "Founder", "CEO", "President", "Managing Director", "Executive Chef", "General Manager"],
        "company_size_min": 1,
        "company_size_max": 100,
        "region": "California USA",
        "battlecard_notes": (
            "We are a software development company providing business/management solutions "
            "and IT solutions (POS, kitchen & floor workflow automation, inventory management, ERP, table ordering systems) "
            "to make restaurant and hospitality operations work faster, eliminate bottlenecks, and boost profit margins."
        ),
        "playbook_strategy": "Focus on operational speed, stock management precision, order throughput, and fast digital transformation ROI."
    }

    initial_state = {
        "tenant_id": tenant_id,
        "run_id": run_id,
        "user_id": "california_sales_rep",
        "prospect_limit": 5,
        "target_domain": None,
        "auto_send_email": False,
        "icp_config": icp_config,
        "raw_accounts": [], # Autonomous sourcing via Serper search
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

    config = {"configurable": {"thread_id": run_id}}

    logger.info("=" * 70)
    logger.info("STARTING SALES AGENT PIPELINE: CALIFORNIA RESTAURANT SME ICP")
    logger.info("TARGET: AT LEAST 2 VERIFIED PROSPECTS WITH VALID DELIVERABLE EMAILS")
    logger.info("=" * 70)

    start_time = time.time()
    final_state = await sales_head_graph.ainvoke(initial_state, config=config)
    elapsed = round(time.time() - start_time, 2)

    outreach_batch = final_state.get("outreach_batch", [])

    print("\n" + "=" * 80)
    print(f"PIPELINE EXECUTION COMPLETE (Elapsed: {elapsed}s)")
    print(f"TOTAL VERIFIED DELIVERABLE PROSPECTS FOUND: {len(outreach_batch)}")
    print("=" * 80)

    for idx, prospect in enumerate(outreach_batch, 1):
        print(f"\n--- PROSPECT #{idx:02d} ---")
        print(f"  Company Name:   {prospect.get('company_name')}")
        print(f"  Domain:         https://{prospect.get('domain')}")
        print(f"  Contact Name:   {prospect.get('contact_name')}")
        print(f"  Contact Title:  {prospect.get('contact_title')}")
        print(f"  Contact Email:  {prospect.get('contact_email')}")
        print(f"  ICP Fit Score:  {prospect.get('icp_score')}/100")
        print(f"  Deliverability: {prospect.get('deliverability_status')}")
        print(f"  Email Subject:  {prospect.get('subject')}")
        print(f"  Email Body:\n{prospect.get('body')}")
        print("-" * 60)

    print("\n=== STAGE EXECUTION LOGS ===")
    for log in final_state.get("logs", []):
        print(f"[{log.get('stage')}]: {log.get('status')} — {log.get('details')}")

    return outreach_batch


if __name__ == "__main__":
    asyncio.run(run_california_campaign())
