"""
End-to-End Test Suite — 6-Stage Autonomous Sales Agent Pipeline.

Tests complete execution of sales_head_graph across all 6 stages:
1. Business Understanding & Sourcing (Serper.dev Company Search)
2. Account Fit Research (Crawl4AI Web Scraping & LLM ICP Qualification)
3. Contact Discovery (Serper Person Search & Naming Pattern Inference)
4. Deliverability Guard (SMTP Catch-All Probing & RFC 5322 Verification)
5. Scoring & Copy Generation (OpenRouter LLM & Dynamic ICP Fit Scoring)
6. Dispatch & CRM Logging (Gmail API & PostgreSQL Persistence)
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
logger = logging.getLogger("test_sales_pipeline_e2e")

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))


async def run_e2e_pipeline_test():
    logger.info("=" * 60)
    logger.info("STARTING END-TO-END SALES PIPELINE INTEGRATION TEST")
    logger.info("=" * 60)

    from graph.sales.graph import sales_head_graph

    run_id = f"e2e-test-{int(time.time())}"
    tenant_id = "00000000-0000-0000-0000-000000000000"

    initial_state = {
        "tenant_id": tenant_id,
        "run_id": run_id,
        "user_id": "e2e_test_runner",
        "prospect_limit": 3,
        "auto_send_email": False,
        "icp_config": {
            "target_industries": ["Software", "SaaS"],
            "target_titles": ["CTO", "VP of Engineering", "Head of Engineering"],
            "company_size_min": 10,
            "company_size_max": 1000,
            "battlecard_notes": "Autonomous AI workflow platform with zero vendor lock-in and 99.9% uptime SLA.",
        },
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

    config = {"configurable": {"thread_id": run_id}}

    logger.info(f"[E2E TEST] Invoking sales_head_graph with tenant_id='{tenant_id}', limit=3")
    start_time = time.time()
    
    try:
        final_state = await sales_head_graph.ainvoke(initial_state, config=config)
    except Exception as e:
        logger.error(f"[E2E TEST FAILED] Exception during sales_head_graph execution: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    elapsed = round(time.time() - start_time, 2)
    logger.info(f"[E2E TEST] Graph execution finished in {elapsed}s")

    # ============================================================
    # INSPECT STAGE LOGS
    # ============================================================
    logger.info("\n" + "=" * 60)
    logger.info("STAGE LOGS AUDIT")
    logger.info("=" * 60)
    
    logs = final_state.get("logs", [])
    for idx, log_entry in enumerate(logs):
        logger.info(f"  Stage #{idx+1} [{log_entry.get('stage')}]: Status={log_entry.get('status')} | Details: {log_entry.get('details')}")

    # ============================================================
    # INSPECT PROSPECTS & OUTREACH BATCH
    # ============================================================
    logger.info("\n" + "=" * 60)
    logger.info("FINAL PIPELINE OUTPUTS")
    logger.info("=" * 60)

    outreach_batch = final_state.get("outreach_batch", [])
    verified_contacts = final_state.get("verified_contacts", [])
    processed_count = final_state.get("processed_count", 0)

    logger.info(f"  Processed Count:    {processed_count}")
    logger.info(f"  Outreach Batch Len: {len(outreach_batch)}")
    logger.info(f"  Verified Contacts:  {len(verified_contacts) if verified_contacts is not None else 0}")
    logger.info(f"  Final Deal Stage:   {final_state.get('deal_stage')}")
    logger.info(f"  Answer Summary:\n{final_state.get('answer')}")

    # ============================================================
    # ASSERTIONS & CONTRACT VERIFICATION
    # ============================================================
    logger.info("\n" + "=" * 60)
    logger.info("RUNNING CONTRACT ASSERTIONS")
    logger.info("=" * 60)

    # 1. Check all 6 stages generated logs
    stages_logged = [l.get("stage") for l in logs]
    expected_stages = [
        "Stage 1", "Stage 2", "Stage 3", "Stage 4", "Stage 5", "Stage 6"
    ]
    for exp_stg in expected_stages:
        matching = [s for s in stages_logged if exp_stg in s]
        assert len(matching) > 0, f"Missing log entry for {exp_stg}! Logs were: {stages_logged}"
        logger.info(f"  ✅ Log verified for {exp_stg}")

    # 2. Assert outreach_batch contents if present
    if outreach_batch:
        for idx, item in enumerate(outreach_batch):
            logger.info(f"\n  Inspecting Batch Item #{idx+1}:")
            logger.info(f"    Company:  {item.get('company_name')} ({item.get('domain')})")
            logger.info(f"    Contact:  {item.get('contact_name')} ({item.get('contact_title')})")
            logger.info(f"    Email:    {item.get('contact_email')} [Deliverability: {item.get('deliverability_status')}]")
            logger.info(f"    Subject:  {item.get('subject')}")
            logger.info(f"    Body snippet: {item.get('body', '')[:100]}...")

            # Must have valid email
            assert item.get("contact_email"), f"Batch item #{idx+1} missing contact_email"
            assert "@" in item["contact_email"], f"Batch item #{idx+1} has invalid email format"
            
            # Must have generated subject & body
            assert item.get("subject"), f"Batch item #{idx+1} missing outreach subject"
            assert item.get("body"), f"Batch item #{idx+1} missing outreach body"
            
            # Must have valid score
            assert item.get("icp_score") and item["icp_score"] >= 40.0, f"Batch item #{idx+1} invalid score"

            # ZERO FABRICATED PERSONA CHECK
            fake_names = ["John Doe", "Jane Smith", "Alex Mercer", "Sarah Connor"]
            for fake in fake_names:
                assert fake.lower() not in item.get("contact_name", "").lower(), \
                    f"Fabricated persona name '{fake}' detected in batch item!"

        logger.info("\n  ✅ All outreach batch items passed deliverability and integrity assertions.")
    else:
        logger.info("\n  ℹ️ Outreach batch is empty (0 deliverable contacts passed Stage 4 verification).")
        logger.info("  ✅ Verified no synthetic data was fabricated or force-injected into CRM batch.")

    logger.info("\n" + "=" * 60)
    logger.info("✅ ALL E2E PIPELINE INTEGRATION ASSERTIONS PASSED!")
    logger.info("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_e2e_pipeline_test())
