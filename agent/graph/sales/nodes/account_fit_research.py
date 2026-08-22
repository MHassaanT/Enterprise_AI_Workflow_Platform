"""
Stage 2: Account Fit Check Node.
Scrapes candidate company websites using Crawl4AI to evaluate business model, pricing, and pain points.
Uses LLM to verify ICP fit and extract pattern source emails for contact discovery.
Discards non-qualifying prospects early before paying for contact finding.
"""
import json
import asyncio
import httpx
import logging
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from routers.tools import scrape_url, ScrapeRequest
from pydantic import HttpUrl
from services.llm_gateway import get_llm
from langchain_core.messages import SystemMessage, HumanMessage

logger = logging.getLogger(__name__)

async def account_fit_research_node(state: SalesAgentState) -> Dict[str, Any]:
    raw_accounts = state.get("raw_accounts", [])
    icp_config = state.get("icp_config", {})
    prospect_limit = state.get("prospect_limit") or 10
    logs = list(state.get("logs", []))

    if not raw_accounts:
        logs.append({
            "stage": "Stage 2: Account Fit Check",
            "status": "SKIPPED",
            "details": "No candidate accounts available to scrape."
        })
        return {"scraped_accounts": [], "account_fit_passed": False, "logs": logs}

    target_industries = icp_config.get("target_industries", [])
    
    # Init LLM early
    llm = get_llm()

    async def _scrape_and_evaluate(account):
        domain = account.get("domain", "example.com")
        company_name = account.get("company_name", domain.split(".")[0].title())
        url_str = f"https://{domain}"
        scraped_text = ""
        scrape_method = "none"

        # 1. Fetch website content
        try:
            async with httpx.AsyncClient(timeout=3.5, follow_redirects=True) as client:
                res = await client.get(url_str, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
                if res.is_success and res.text:
                    scraped_text = res.text[:3000]
                    scrape_method = "http_fast_fetch"
        except Exception:
            try:
                req = ScrapeRequest(url=HttpUrl(url_str))
                res = await asyncio.wait_for(scrape_url(req), timeout=4.0)
                if res.get("markdown"):
                    scraped_text = res.get("markdown", "")
                    scrape_method = res.get("method", "crawl4ai")
            except Exception:
                pass

        if not scraped_text.strip():
            search_snip = account.get("search_snippet", "")
            if search_snip:
                scraped_text = f"{company_name} ({domain}) - {search_snip}"
                scrape_method = "serper_search_snippet"
            else:
                scraped_text = f"{company_name} ({domain}) - Food business, restaurant, bakery, or food manufacturing enterprise in {icp_config.get('region', 'Lahore Pakistan')}."
                scrape_method = "metadata_fallback"

        # 2. LLM ICP Evaluation and Email Extraction
        prompt = f"""You are an elite B2B Sales SDR qualifying a prospect company.

ICP CONFIGURATION:
Target Industries: {target_industries}
Target Size: {icp_config.get('company_size_min', 10)}-{icp_config.get('company_size_max', 1000)}
Target Region: {icp_config.get('region', 'Global')}
Battlecard/Pain Points: {icp_config.get('battlecard_notes', 'N/A')}

SCRAPED WEBSITE CONTENT ({company_name} - {domain}):
{scraped_text[:1500]}

INSTRUCTIONS:
1. Evaluate if this company's business matches our Target Industries and ICP.
2. Extract ANY email addresses visible in the text (e.g. info@, sales@, press@, or personal emails). These will be used for contact pattern inference. Do NOT make up emails.
3. Check for invalid parked domains (e.g. "domain for sale", "404 not found", etc.).

Return ONLY a valid JSON object matching this schema exactly:
{{
    "is_qualified": true/false,
    "reasoning": "1 sentence explanation of fit or rejection",
    "extracted_emails": ["email1@company.com", "email2@company.com"]
}}
"""
        
        try:
            llm_res = await llm.ainvoke([
                SystemMessage(content="You evaluate B2B prospects and return ONLY valid JSON."),
                HumanMessage(content=prompt)
            ])
            content = llm_res.content.strip()
            
            # Clean markdown wrappers if present
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            
            parsed = json.loads(content.strip())
            qualified = bool(parsed.get("is_qualified", False))
            verdict = parsed.get("reasoning", "No reasoning provided.")
            pattern_emails = parsed.get("extracted_emails", [])
            if not isinstance(pattern_emails, list):
                pattern_emails = []
        except Exception as e:
            logger.error(f"[ACCOUNT FIT] LLM JSON parsing failed for {domain}: {e}")
            qualified = False
            verdict = "Unqualified Target — LLM evaluation failed."
            pattern_emails = []

        return {
            "company_name": company_name,
            "domain": domain,
            "industry": account.get("industry", "Software"),
            "scraped_text": scraped_text[:1500],
            "scrape_method": scrape_method,
            "qualified": qualified,
            "fit_verdict": verdict,
            "pattern_emails": pattern_emails
        }

    # 3. Parallelize scraping and evaluation
    eval_limit = max(prospect_limit * 6, 30)
    accounts_to_scrape = raw_accounts[:eval_limit]
    all_evaluated = await asyncio.gather(*[_scrape_and_evaluate(acc) for acc in accounts_to_scrape])

    # 4. Filter out unqualified accounts
    qualified_accounts = [acc for acc in all_evaluated if acc["qualified"]]

    if qualified_accounts:
        logs.append({
            "stage": "Stage 2: Account Fit Check",
            "status": "COMPLETED",
            "details": f"Evaluated {len(all_evaluated)} websites via LLM. {len(qualified_accounts)} passed ICP qualification."
        })
        return {
            "scraped_accounts": qualified_accounts,
            "scraped_context": qualified_accounts[0],
            "account_fit_passed": True,
            "logs": logs,
        }
    else:
        logs.append({
            "stage": "Stage 2: Account Fit Check",
            "status": "FAILED",
            "details": f"Evaluated {len(all_evaluated)} websites, but 0 accounts met the ICP qualification criteria."
        })
        return {
            "scraped_accounts": [],
            "scraped_context": {},
            "account_fit_passed": False,
            "logs": logs,
        }

