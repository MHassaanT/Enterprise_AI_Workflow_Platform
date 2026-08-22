"""
Live Campaign Execution Script — Lahore Food Businesses (SME) ICP (10 Valid Prospects).

Target ICP:
- Industry: Food Businesses (SMEs, Restaurants, Bakeries, Food Processing, FMCG, Cafes, Catering)
- Max headcount: 50
- Region: Lahore, Pakistan
- Value Proposition: Business/management software and IT solutions to speed up operations and increase efficiency.
- Target: 10 Valid Prospects
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
logger = logging.getLogger("lahore_food_campaign")

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))


async def run_full_campaign():
    from graph.sales.graph import sales_head_graph

    run_id = f"lahore-food-10valid-{int(time.time())}"
    tenant_id = "00000000-0000-0000-0000-000000000000"

    icp_config = {
        "target_industries": [
            "Food Business", "Restaurant", "Bakery", "Food Processing", "FMCG Food", "Cafe", "Catering"
        ],
        "target_titles": [
            "Owner", "Founder", "CEO", "General Manager", "Managing Director", "Operations Manager"
        ],
        "company_size_min": 1,
        "company_size_max": 50,
        "region": "Lahore Pakistan",
        "battlecard_notes": (
            "We are a software development company providing business/management solutions "
            "and IT solutions (ERP, POS, inventory, order management, workflow automation) "
            "to make food businesses work faster, eliminate operational bottlenecks, and boost profit margins."
        ),
        "playbook_strategy": "Focus on operational speed, stock management efficiency, and quick digital transformation ROI."
    }

    # 18 Active SME Food Businesses in Lahore, Pakistan
    target_lahore_food_accounts = [
        {"company_name": "Gourmet Foods Lahore", "domain": "gourmetfoods.pk", "industry": "Bakery & Food Manufacturer"},
        {"company_name": "Kitchen Cuisine", "domain": "kitchencuisine.com.pk", "industry": "Bakery & Restaurant"},
        {"company_name": "Chashni Sweets & Bakery", "domain": "chashni.pk", "industry": "Confectionery & Bakery"},
        {"company_name": "Bundu Khan Sweets & Bakers", "domain": "bundukhansweets.pk", "industry": "Food & Bakery Chain"},
        {"company_name": "OPTP Fast Food Lahore", "domain": "optp.pk", "industry": "Restaurant Chain"},
        {"company_name": "Fri Chiks Lahore", "domain": "frichiks.pk", "industry": "Restaurant Chain"},
        {"company_name": "Tehzeeb Bakers", "domain": "tehzeeb.com", "industry": "Bakery & Confectionery"},
        {"company_name": "Mitchell's Fruit Farms Lahore", "domain": "mitchells.com.pk", "industry": "Food Processing"},
        {"company_name": "Shangrila Foods", "domain": "shangrila.com.pk", "industry": "FMCG Food Manufacturer"},
        {"company_name": "Haveli Restaurant Lahore", "domain": "haveli.com.pk", "industry": "Restaurant"},
        {"company_name": "Bread & Beyond", "domain": "breadbeyond.com", "industry": "Bakery Chain"},
        {"company_name": "Baked.pk Lahore", "domain": "baked.pk", "industry": "Specialty Bakery"},
        {"company_name": "Shezan Bakers Lahore", "domain": "shezanbakers.pk", "industry": "Bakery & Beverages"},
        {"company_name": "OB Hospitality Group", "domain": "obhospitalitygroup.com", "industry": "Hospitality & Restaurant Group"},
        {"company_name": "Bliss Food Company", "domain": "blissfood.pk", "industry": "Food & Beverage"},
        {"company_name": "National Foods Limited", "domain": "nfoods.com", "industry": "Food Products Manufacturer"},
        {"company_name": "Kashmir Cooking Oil / UIL", "domain": "uil.com.pk", "industry": "Food & Cooking Oil Manufacturer"},
        {"company_name": "The Monal Restaurant", "domain": "themonal.com", "industry": "Restaurant Group"},
    ]

    initial_state = {
        "tenant_id": tenant_id,
        "run_id": run_id,
        "user_id": "lahore_sales_rep",
        "prospect_limit": 25,
        "target_domain": None,
        "auto_send_email": False,
        "icp_config": icp_config,
        "raw_accounts": target_lahore_food_accounts,
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
    logger.info("STARTING LAHORE FOOD BUSINESSES SALES PIPELINE RUN (10 VALID PROSPECTS)")
    logger.info("=" * 60)

    start_time = time.time()
    final_state = await sales_head_graph.ainvoke(initial_state, config=config)
    elapsed = round(time.time() - start_time, 2)

    logger.info(f"\nCompleted in {elapsed}s")

    outreach_batch = final_state.get("outreach_batch", [])

    print("\n" + "=" * 80)
    print(f"TOTAL VALID PROSPECTS FOUND: {len(outreach_batch)}")
    print("=" * 80)

    for idx, prospect in enumerate(outreach_batch, 1):
        print(f"\n--- PROSPECT #{idx} ---")
        print(f"  Company Name:   {prospect.get('company_name')}")
        print(f"  Domain:         https://{prospect.get('domain')}")
        print(f"  Contact Name:   {prospect.get('contact_name')}")
        print(f"  Contact Title:  {prospect.get('contact_title')}")
        print(f"  Contact Email:  {prospect.get('contact_email')}")
        print(f"  ICP Fit Score:  {prospect.get('icp_score')}/100")
        print(f"  Deliverability: {prospect.get('deliverability_status')}")
        print(f"  Email Subject:  {prospect.get('subject')}")
        print(f"  Email Body:\n{prospect.get('body')}")
        print("-" * 50)

    return outreach_batch


if __name__ == "__main__":
    asyncio.run(run_full_campaign())
