"""
Phase 1 Integration Test — Search Discovery Pipeline.

Tests the Serper.dev search adapter against a real ICP config.
Run with: python -m test_search_discovery
"""
import asyncio
import json
import sys
import os

# Add agent dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tool_gateway.search_discovery import (
    search_company_accounts,
    _build_queries,
    _extract_domain,
    _build_size_hint,
)


async def test_query_builder():
    """Test that query builder produces expected output from ICP config."""
    print("\n" + "=" * 60)
    print("TEST 1: Query Builder (no hardcoded industries/regions)")
    print("=" * 60)

    # Test with sample ICP
    queries = _build_queries(
        target_industries=["Software", "Fintech", "HealthTech"],
        company_size_min=10,
        company_size_max=500,
        region="United States",
    )
    print(f"\nGenerated {len(queries)} queries:")
    for i, q in enumerate(queries, 1):
        print(f"  {i}. {q}")

    assert len(queries) >= 3, f"Expected at least 3 queries, got {len(queries)}"
    assert len(queries) <= 5, f"Expected at most 5 queries, got {len(queries)}"

    # Verify no hardcoded content leaked in
    for q in queries:
        assert "stripe" not in q.lower(), f"Hardcoded 'stripe' found in query: {q}"
        assert "shopify" not in q.lower(), f"Hardcoded 'shopify' found in query: {q}"

    # Verify ICP fields are present
    assert any("Software" in q for q in queries), "ICP industry 'Software' not in any query"
    assert any("United States" in q for q in queries), "ICP region 'United States' not in any query"

    print("✅ PASSED: Query builder uses ICP fields, no hardcoded data")


async def test_domain_extraction():
    """Test domain extraction and non-company filtering."""
    print("\n" + "=" * 60)
    print("TEST 2: Domain Extraction & Filtering")
    print("=" * 60)

    test_cases = [
        ("https://www.acme.com/about", "acme.com"),
        ("https://www.linkedin.com/company/acme", None),  # LinkedIn filtered
        ("https://en.wikipedia.org/wiki/Acme", None),  # Wikipedia filtered
        ("https://github.com/acme/repo", None),  # GitHub filtered
        ("https://news.ycombinator.com", "news.ycombinator.com"),  # Not in filter list
        ("https://datadog.com/product", "datadog.com"),  # Valid company
        ("https://www.reddit.com/r/startup", None),  # Reddit filtered
        ("invalid-url", None),  # Invalid URL
    ]

    for url, expected in test_cases:
        result = _extract_domain(url)
        status = "✅" if result == expected else "❌"
        print(f"  {status} {url} → {result} (expected: {expected})")
        assert result == expected, f"Failed: {url} → {result}, expected {expected}"

    print("✅ PASSED: Domain extraction and non-company filtering works correctly")


async def test_size_hint():
    """Test size hint generation."""
    print("\n" + "=" * 60)
    print("TEST 3: Size Hint Builder")
    print("=" * 60)

    test_cases = [
        ((10, 1000), ""),  # Too broad
        ((10, 50), "small"),
        ((50, 200), "50-200"),
        ((100, 500), "mid-size"),
        ((200, 1000), "mid-market"),
        ((500, 5000), "enterprise"),
    ]

    for (min_s, max_s), expected in test_cases:
        result = _build_size_hint(min_s, max_s)
        status = "✅" if result == expected else "❌"
        print(f"  {status} ({min_s}-{max_s}) → '{result}' (expected: '{expected}')")
        assert result == expected, f"Failed: ({min_s}-{max_s}) → '{result}', expected '{expected}'"

    print("✅ PASSED: Size hint generation works correctly")


async def test_no_api_key():
    """Test that missing API key returns empty result, not fake data."""
    print("\n" + "=" * 60)
    print("TEST 4: No-Fallback Checkpoint (missing API key)")
    print("=" * 60)

    # Temporarily clear the env var
    old_key = os.environ.pop("SERPER_API_KEY", None)

    result = await search_company_accounts(
        tenant_id="test-tenant-no-key",
        target_industries=["Software", "SaaS"],
        company_size_min=10,
        company_size_max=500,
        limit=10,
    )

    if old_key:
        os.environ["SERPER_API_KEY"] = old_key

    print(f"  Status: {result['status']}")
    print(f"  Accounts count: {len(result['accounts'])}")
    print(f"  Reason: {result['reason']}")

    assert result["status"] in ("no_results", "error"), f"Expected no_results/error, got {result['status']}"
    assert len(result["accounts"]) == 0, f"Expected 0 accounts, got {len(result['accounts'])}"
    assert result["reason"], "Expected a reason string, got empty"

    print("✅ PASSED: Missing API key returns empty result with clear reason (no fake data)")


async def test_live_search():
    """Test real search against Serper.dev API with current ICP."""
    print("\n" + "=" * 60)
    print("TEST 5: Live Search (requires SERPER_API_KEY)")
    print("=" * 60)

    api_key = os.environ.get("SERPER_API_KEY", "")
    if not api_key or len(api_key) < 5:
        print("  ⚠️ SKIPPED: No SERPER_API_KEY set. Set it to run live search test.")
        return

    # Use realistic ICP config
    result = await search_company_accounts(
        tenant_id="test-tenant-live",
        target_industries=["Software", "SaaS"],
        company_size_min=50,
        company_size_max=500,
        limit=10,
        exclude_domains=["google.com", "microsoft.com"],
        region="United States",
    )

    print(f"\n  Status: {result['status']}")
    print(f"  Source: {result['source']}")
    print(f"  Accounts found: {len(result['accounts'])}")
    print(f"  Queries executed: {result.get('queries_executed', [])}")
    print(f"  Reason: {result.get('reason', 'N/A')}")

    if result["accounts"]:
        print(f"\n  Company domains discovered:")
        for acc in result["accounts"]:
            print(f"    • {acc['company_name']} ({acc['domain']}) — {acc['industry']}")
            # Verify no excluded domains leaked through
            assert acc["domain"] not in ("google.com", "microsoft.com"), f"Excluded domain leaked: {acc['domain']}"
            # Verify account has required fields
            assert acc.get("domain"), "Missing domain"
            assert acc.get("company_name"), "Missing company_name"
            assert acc.get("source") == "serper_search_api", f"Wrong source: {acc.get('source')}"
    else:
        print("  ⚠️ No accounts found (may indicate API issue or very restrictive query)")

    print(f"\n✅ PASSED: Live search returned real data (or clean empty result)")


async def main():
    print("=" * 60)
    print("Phase 1 Integration Tests — Search Discovery Pipeline")
    print("=" * 60)

    await test_query_builder()
    await test_domain_extraction()
    await test_size_hint()
    await test_no_api_key()
    await test_live_search()

    print("\n" + "=" * 60)
    print("ALL TESTS COMPLETED")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
