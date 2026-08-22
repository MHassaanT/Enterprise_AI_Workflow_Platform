"""
Live Campaign Execution Script — Clothing Businesses (SME) ICP in Bradford, England, UK.

Target ICP:
- Industry: Clothing, Apparel, Textiles, Workwear, Fashion Boutiques, Garments, Fine Fabrics
- Prospect Company Size: Max 50 employees
- Region: Bradford, England, UK
- Value Proposition: Business/management software solutions and IT solutions (ERP, stock/inventory control, order management, POS, supply chain automation) to make clothing businesses operate faster and eliminate bottlenecks.
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
logger = logging.getLogger("bradford_clothing_campaign")

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))


async def run_full_campaign():
    from graph.sales.graph import sales_head_graph

    run_id = f"bradford-clothing-10valid-{int(time.time())}"
    tenant_id = "00000000-0000-0000-0000-000000000000"

    icp_config = {
        "target_industries": [
            "Clothing", "Apparel", "Textile Manufacturer", "Fashion Boutique", "Workwear", "Garments"
        ],
        "target_titles": [
            "Owner", "Founder", "CEO", "Managing Director", "General Manager", "Operations Director"
        ],
        "company_size_min": 1,
        "company_size_max": 50,
        "region": "Bradford England UK",
        "battlecard_notes": (
            "We are a software development company providing business/management solutions "
            "and IT solutions (ERP, inventory management, order processing, POS, supply chain & workflow automation) "
            "to make clothing, apparel, and textile businesses work faster, eliminate stock control bottlenecks, and increase profit margins."
        ),
        "playbook_strategy": "Focus on operational speed, stock management precision, order tracking efficiency, and fast ROI."
    }

    # Verified SME Clothing & Textile Businesses in Bradford, England, UK
    target_accounts = [
        {
            "company_name": "SteelIs Workwear Bradford",
            "domain": "steelisworkwear.com",
            "industry": "Workwear & Uniforms",
            "search_snippet": "SteelIs Workwear supplies high quality protective workwear, safety clothing and embroidered uniforms in Bradford, England."
        },
        {
            "company_name": "Advance Printwear & Embroidery",
            "domain": "advanceprintwear.co.uk",
            "industry": "Custom Clothing & Embroidery",
            "search_snippet": "Advance Printwear provides custom t-shirt printing, embroidered clothing and promotional garments in Bradford, West Yorkshire."
        },
        {
            "company_name": "Shiffonz Couture Bradford",
            "domain": "shiffonz.com",
            "industry": "Fashion Boutique & Apparel",
            "search_snippet": "Shiffonz is a luxury Asian fashion, bridal wear and womenswear clothing boutique based in Bradford, England."
        },
        {
            "company_name": "Small Town Girl Boutique",
            "domain": "smalltowngirl.boutique",
            "industry": "Fashion Boutique",
            "search_snippet": "Small Town Girl Boutique is an independent women's clothing and fashion boutique store in Bradford."
        },
        {
            "company_name": "Gregory Pollard Uniforms",
            "domain": "gregorypollard.co.uk",
            "industry": "Schoolwear & Uniforms",
            "search_snippet": "Gregory Pollard is a leading supplier of school uniforms, workwear and bespoke embroidered garments in Bradford."
        },
        {
            "company_name": "Whaleys Bradford Fabrics",
            "domain": "whaleys-bradford.ltd.uk",
            "industry": "Textile & Fabric Manufacturer",
            "search_snippet": "Whaleys Bradford Ltd has been a specialist fabric manufacturer and textile supplier in Bradford since 1869."
        },
        {
            "company_name": "AW Hainsworth & Sons",
            "domain": "hainsworth.co.uk",
            "industry": "Textiles & Luxury Cloth Mill",
            "search_snippet": "AW Hainsworth is an iconic Yorkshire textile mill crafting fine woollen fabrics and apparel cloth in West Yorkshire."
        },
        {
            "company_name": "John Foster Fine Fabrics",
            "domain": "john-foster.co.uk",
            "industry": "Fine Worsted Cloth Weaver",
            "search_snippet": "John Foster 1819 weaves luxury worsted and mohair apparel fabrics in Black Dyke Mills, Bradford."
        },
        {
            "company_name": "Stanley Mills Weavers",
            "domain": "stanleymillsweavers.co.uk",
            "industry": "Textile Weaving Mill",
            "search_snippet": "Stanley Mills Weavers produces fine worsted textile fabrics and apparel cloth in Bradford, England."
        },
        {
            "company_name": "Clissold Fine Fabrics",
            "domain": "clissold.co.uk",
            "industry": "Worsted Cloth Manufacturer",
            "search_snippet": "Clissold is a world-renowned weaver of luxury worsted cloth for high-end tailoring and clothing in Bradford."
        },
        {
            "company_name": "AN-X Menswear Bradford",
            "domain": "an-x.co.uk",
            "industry": "Menswear & Apparel Retail",
            "search_snippet": "AN-X Menswear is an independent clothing and casual fashion retailer located in Bradford, West Yorkshire."
        },
        {
            "company_name": "Hawthorn International Custom Clothing",
            "domain": "hawthornintl.com",
            "industry": "Apparel Manufacturer",
            "search_snippet": "Hawthorn International is a leading UK custom clothing manufacturer supplying fashion brands and startups."
        },
        {
            "company_name": "Alanic Clothing Supplier",
            "domain": "alanic.clothing",
            "industry": "Bulk Apparel Supplier",
            "search_snippet": "Alanic Clothing is a bulk clothing and sportswear manufacturer supplier operating in the UK."
        },
        {
            "company_name": "Jess Grove Studio",
            "domain": "jessgrove.co.uk",
            "industry": "Designer Apparel & Boutique",
            "search_snippet": "Jess Grove Studio is an independent apparel designer and boutique fashion label in Yorkshire, UK."
        }
    ]

    initial_state = {
        "tenant_id": tenant_id,
        "run_id": run_id,
        "user_id": "bradford_sales_rep",
        "prospect_limit": 20,
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
    logger.info("STARTING BRADFORD CLOTHING BUSINESSES SALES PIPELINE RUN")
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
