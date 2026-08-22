import asyncio
import os
import sys

# Add agent dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from graph.sales.nodes.account_fit_research import account_fit_research_node

async def test_account_fit():
    print("=" * 60)
    print("Phase 2 Integration Test — Account Fit Research & LLM Qualification")
    print("=" * 60)
    
    # Mock state
    mock_state = {
        "raw_accounts": [
            {
                "company_name": "Vercel",
                "domain": "vercel.com",
                "industry": "Software"
            },
            {
                "company_name": "McDonalds",
                "domain": "mcdonalds.com",
                "industry": "Food & Beverage"
            }
        ],
        "icp_config": {
            "target_industries": ["Software", "SaaS", "Cloud Infrastructure"],
            "company_size_min": 10,
            "company_size_max": 5000,
            "region": "Global",
            "battlecard_notes": "We offer cloud infrastructure for frontend developers."
        },
        "prospect_limit": 5,
        "logs": []
    }
    
    print("\nRunning account_fit_research_node...")
    print(f"Target Industries: {mock_state['icp_config']['target_industries']}")
    print(f"Accounts to evaluate: {[a['company_name'] for a in mock_state['raw_accounts']]}")
    
    result = await account_fit_research_node(mock_state)
    
    print("\n" + "=" * 60)
    print("TEST RESULTS")
    print("=" * 60)
    print(f"Account Fit Passed: {result['account_fit_passed']}")
    print(f"Scraped Accounts Count: {len(result['scraped_accounts'])}")
    
    for acc in result['scraped_accounts']:
        print(f"\n✅ Qualified: {acc['company_name']} ({acc['domain']})")
        print(f"   Verdict: {acc['fit_verdict']}")
        print(f"   Pattern Emails Extracted: {acc['pattern_emails']}")
        print(f"   Scrape Method: {acc['scrape_method']}")
        
    # Verify logic
    qualified_domains = [a['domain'] for a in result['scraped_accounts']]
    assert "vercel.com" in qualified_domains, "Vercel should be qualified for Software ICP"
    assert "mcdonalds.com" not in qualified_domains, "McDonalds should be rejected for Software ICP"
    
    print("\n✅ PASSED: LLM correctly qualified B2B software company and rejected B2C consumer company.")
    
if __name__ == "__main__":
    asyncio.run(test_account_fit())
