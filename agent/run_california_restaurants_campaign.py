"""
Live Campaign Execution Script — California, USA Restaurant SME ICP (3 Verified Prospects).

Target ICP:
- Industry: Restaurants, Food Hospitality, Dining Groups, Fine Dining, Sustainable Catering
- Prospect Company Size: Max 100 employees
- Region: California, USA
- Value Proposition: Business/management software solutions and IT solutions (ERP, POS, inventory, kitchen workflow automation, order management) to make restaurant operations run faster and more efficiently.
- Target: 3 Verified Prospects with valid email addresses
"""
import sys
import os
import time
import asyncio
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger("california_restaurants_campaign")

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))


async def run_full_campaign():
    from graph.sales.graph import sales_head_graph

    run_id = f"california-restaurants-3valid-{int(time.time())}"
    tenant_id = "00000000-0000-0000-0000-000000000000"

    icp_config = {
        "target_industries": [
            "Restaurant", "Dining Group", "Fine Dining", "Food Hospitality", "Catering"
        ],
        "target_titles": [
            "Owner", "Founder", "CEO", "Managing Director", "Executive Chef", "General Manager"
        ],
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

    # Verified SME Restaurant Enterprises in California, USA
    target_accounts = [
        {
            "company_name": "Epicurean Group California",
            "domain": "epicurean-group.com",
            "industry": "Sustainable Food Service & Dining",
            "search_snippet": "Epicurean Group is a Northern California sustainable food service management and restaurant enterprise."
        },
        {
            "company_name": "The Slanted Door San Francisco",
            "domain": "slanteddoor.com",
            "industry": "Modern Fine Dining Restaurant",
            "search_snippet": "The Slanted Door is an iconic modern Vietnamese fine dining restaurant group based in San Francisco, California."
        },
        {
            "company_name": "Gott's Roadside California",
            "domain": "gotts.com",
            "industry": "Casual Dining Restaurant Group",
            "search_snippet": "Gott's Roadside is an iconic California restaurant group with locations across Napa, San Francisco, and the Bay Area."
        }
    ]

    initial_state = {
        "tenant_id": tenant_id,
        "run_id": run_id,
        "user_id": "california_sales_rep",
        "prospect_limit": 5,
        "target_domain": None,
        "auto_send_email": False,
        "icp_config": icp_config,
        "raw_accounts": target_accounts,
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

    logger.info("=" * 60)
    logger.info("STARTING CALIFORNIA RESTAURANTS SALES PIPELINE RUN (3 VERIFIED PROSPECTS)")
    logger.info("=" * 60)

    start_time = time.time()
    final_state = await sales_head_graph.ainvoke(initial_state, config=config)
    elapsed = round(time.time() - start_time, 2)

    logger.info(f"\nCompleted in {elapsed}s")

    outreach_batch = final_state.get("outreach_batch", [])

    print("\n" + "=" * 80)
    print(f"TOTAL VALID PROSPECTS VERIFIED: {len(outreach_batch)}")
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

    return outreach_batch


if __name__ == "__main__":
    asyncio.run(run_full_campaign())
