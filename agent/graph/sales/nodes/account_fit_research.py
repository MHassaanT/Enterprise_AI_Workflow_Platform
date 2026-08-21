"""
Stage 2: Account Fit Check Node.
Scrapes candidate company websites using Crawl4AI to evaluate business model, pricing, and pain points.
Discards non-qualifying prospects early before paying for contact finding.
"""
from typing import Dict, Any, List
from graph.sales.state import SalesAgentState
from routers.tools import scrape_url, ScrapeRequest
from pydantic import HttpUrl


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

    target_industries = [i.lower() for i in icp_config.get("target_industries", []) if i]
    import asyncio
    import httpx

    async def _scrape_and_evaluate(account):
        domain = account.get("domain", "example.com")
        company_name = account.get("company_name", domain.split(".")[0].title())
        account_ind = (account.get("industry") or "").lower()
        url_str = f"https://{domain}"
        scraped_text = f"Company domain: {domain}. Active in {account.get('industry', 'technology')}."
        scrape_method = "metadata_fast_fetch"

        try:
            async with httpx.AsyncClient(timeout=2.5, follow_redirects=True) as client:
                res = await client.get(url_str, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
                if res.is_success and res.text:
                    scraped_text = res.text[:2000]
                    scrape_method = "http_fast_fetch"
        except Exception:
            try:
                req = ScrapeRequest(url=HttpUrl(url_str))
                res = await asyncio.wait_for(scrape_url(req), timeout=2.5)
                if res.get("markdown"):
                    scraped_text = res.get("markdown", "")
                    scrape_method = res.get("method", "crawl4ai")
            except Exception:
                pass

        # Real ICP qualification check
        scraped_lower = scraped_text.lower()
        industry_match = False
        if not target_industries:
            industry_match = True
        else:
            for ind in target_industries:
                if ind in account_ind or ind in scraped_lower or any(word in scraped_lower for word in ind.split()):
                    industry_match = True
                    break

        # Check for spam/parked/broken domains
        is_invalid_domain = any(term in scraped_lower for term in ["domain for sale", "parked domain", "buy this domain", "404 not found", "access denied"])
        
        qualified = industry_match and not is_invalid_domain
        verdict = "Qualified B2B Target — Aligns with ICP criteria." if qualified else "Unqualified Target — Discarded due to ICP industry/content mismatch."

        return {
            "company_name": company_name,
            "domain": domain,
            "industry": account.get("industry", "Software"),
            "scraped_text": scraped_text[:1500],
            "scrape_method": scrape_method,
            "qualified": qualified,
            "fit_verdict": verdict,
        }

    # Parallelize scraping and evaluation
    accounts_to_scrape = raw_accounts[:prospect_limit]
    all_evaluated = await asyncio.gather(*[_scrape_and_evaluate(acc) for acc in accounts_to_scrape])

    # Filter out unqualified accounts
    qualified_accounts = [acc for acc in all_evaluated if acc["qualified"]]

    if qualified_accounts:
        logs.append({
            "stage": "Stage 2: Account Fit Check",
            "status": "COMPLETED",
            "details": f"Scraped and evaluated {len(all_evaluated)} target company websites. {len(qualified_accounts)} accounts passed ICP qualification."
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
            "details": f"Scraped {len(all_evaluated)} target company websites, but 0 accounts met ICP qualification criteria."
        })
        return {
            "scraped_accounts": [],
            "scraped_context": {},
            "account_fit_passed": False,
            "logs": logs,
        }

