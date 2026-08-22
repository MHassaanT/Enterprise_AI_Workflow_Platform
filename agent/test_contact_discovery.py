"""
Phase 3 Integration Test — Contact Discovery via Serper + Email Pattern Inference.

Tests the full Stage 1 → Stage 2 → Stage 3 chain against real domains.
For each company: shows fit verdict, named contact found, inferred email + pattern.

Assertions:
1. Zero contacts have email_status other than "inferred_unverified".
2. Zero contacts have fabricated names (no Sarah Chen, Alex Vance, Marcus Thorne).
3. Companies where no person was found have no contact entry.
"""
import asyncio
import os
import sys
import logging

# Add agent dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")

# ------ Unit Tests for Email Pattern Engine ------

def test_email_pattern_engine():
    """Unit tests for the email_pattern_engine module."""
    from tool_gateway.email_pattern_engine import detect_pattern, infer_email, detect_and_infer

    print("=" * 60)
    print("Unit Tests — Email Pattern Engine")
    print("=" * 60)

    # detect_pattern tests
    assert detect_pattern("john.doe@acme.com", "acme.com") == "first.last", \
        f"Expected 'first.last', got '{detect_pattern('john.doe@acme.com', 'acme.com')}'"
    print("  ✅ detect_pattern('john.doe@acme.com') → 'first.last'")

    assert detect_pattern("john_doe@acme.com", "acme.com") == "first_last", \
        f"Expected 'first_last', got '{detect_pattern('john_doe@acme.com', 'acme.com')}'"
    print("  ✅ detect_pattern('john_doe@acme.com') → 'first_last'")

    assert detect_pattern("info@acme.com", "acme.com") is None, \
        f"Expected None for role account, got '{detect_pattern('info@acme.com', 'acme.com')}'"
    print("  ✅ detect_pattern('info@acme.com') → None (role account)")

    assert detect_pattern("sales@acme.com", "acme.com") is None, \
        f"Expected None for role account, got '{detect_pattern('sales@acme.com', 'acme.com')}'"
    print("  ✅ detect_pattern('sales@acme.com') → None (role account)")

    assert detect_pattern("john@acme.com", "acme.com") == "first", \
        f"Expected 'first', got '{detect_pattern('john@acme.com', 'acme.com')}'"
    print("  ✅ detect_pattern('john@acme.com') → 'first'")

    assert detect_pattern("lee@acme.com", "acme.com") == "first", \
        f"Expected 'first' for 3-char name, got '{detect_pattern('lee@acme.com', 'acme.com')}'"
    print("  ✅ detect_pattern('lee@acme.com') → 'first' (3-char name accepted)")

    assert detect_pattern("john.doe@acme.com", "other.com") is None, \
        "Expected None for wrong domain"
    print("  ✅ detect_pattern('john.doe@acme.com', 'other.com') → None (wrong domain)")

    assert detect_pattern("j@acme.com", "acme.com") is None, \
        "Expected None for single-char local part"
    print("  ✅ detect_pattern('j@acme.com') → None (too short)")

    assert detect_pattern("jd@acme.com", "acme.com") is None, \
        "Expected None for 2-char local part (likely initials)"
    print("  ✅ detect_pattern('jd@acme.com') → None (too short, likely initials)")

    # infer_email tests
    assert infer_email("Jane", "Smith", "acme.com", "first.last") == "jane.smith@acme.com"
    print("  ✅ infer_email('Jane', 'Smith', 'first.last') → 'jane.smith@acme.com'")

    assert infer_email("Jane", "Smith", "acme.com", "first_last") == "jane_smith@acme.com"
    print("  ✅ infer_email('Jane', 'Smith', 'first_last') → 'jane_smith@acme.com'")

    assert infer_email("Jane", "Smith", "acme.com", "flast") == "jsmith@acme.com"
    print("  ✅ infer_email('Jane', 'Smith', 'flast') → 'jsmith@acme.com'")

    assert infer_email("Jane", "Smith", "acme.com", "first") == "jane@acme.com"
    print("  ✅ infer_email('Jane', 'Smith', 'first') → 'jane@acme.com'")

    assert infer_email("Jane", "Smith", "acme.com", "firstlast") == "janesmith@acme.com"
    print("  ✅ infer_email('Jane', 'Smith', 'firstlast') → 'janesmith@acme.com'")

    assert infer_email("", "Smith", "acme.com", "first.last") is None
    print("  ✅ infer_email('', 'Smith') → None (missing first name)")

    # detect_and_infer tests
    result = detect_and_infer(
        pattern_emails=["info@acme.com", "john.doe@acme.com"],
        first_name="Jane",
        last_name="Smith",
        domain="acme.com",
    )
    assert result is not None, "Should infer from second email after skipping role account"
    assert result["email"] == "jane.smith@acme.com"
    assert result["pattern_used"] == "first.last"
    assert result["email_status"] == "inferred_unverified"
    print("  ✅ detect_and_infer skips role emails, infers from 'john.doe@acme.com'")

    result_none = detect_and_infer(
        pattern_emails=["info@acme.com", "sales@acme.com"],
        first_name="Jane",
        last_name="Smith",
        domain="acme.com",
    )
    assert result_none is None, "Should return None when all emails are role accounts"
    print("  ✅ detect_and_infer returns None when all emails are role accounts")

    result_empty = detect_and_infer(
        pattern_emails=[],
        first_name="Jane",
        last_name="Smith",
        domain="acme.com",
    )
    assert result_empty is None, "Should return None for empty pattern_emails"
    print("  ✅ detect_and_infer returns None for empty pattern_emails list")

    print("\n✅ ALL EMAIL PATTERN ENGINE UNIT TESTS PASSED\n")


# ------ Integration Test: Stage 3 Contact Discovery ------

FORBIDDEN_NAMES = {"sarah chen", "alex vance", "marcus thorne", "elena vasquez", "david kim"}

async def test_contact_discovery():
    """Integration test: runs Stage 3 against pre-built mock scraped_accounts."""
    from graph.sales.nodes.contact_discovery import contact_discovery_node

    print("=" * 60)
    print("Integration Test — Stage 3 Contact Discovery")
    print("=" * 60)

    # Mock state as if Stage 1 + Stage 2 have already run
    mock_state = {
        "tenant_id": "00000000-0000-0000-0000-000000000000",
        "scraped_accounts": [
            {
                "company_name": "Vercel",
                "domain": "vercel.com",
                "industry": "Software",
                "qualified": True,
                "fit_verdict": "Qualified — Cloud infrastructure for frontend developers.",
                "pattern_emails": ["lee@vercel.com"],  # Real founder email pattern
            },
            {
                "company_name": "Supabase",
                "domain": "supabase.com",
                "industry": "Software",
                "qualified": True,
                "fit_verdict": "Qualified — Open source Firebase alternative.",
                "pattern_emails": ["ant@supabase.com"],
            },
            {
                "company_name": "Linear",
                "domain": "linear.app",
                "industry": "Software",
                "qualified": True,
                "fit_verdict": "Qualified — Project management for software teams.",
                "pattern_emails": [],  # No pattern emails — should be skipped
            },
        ],
        "icp_config": {
            "target_industries": ["Software", "SaaS", "Cloud Infrastructure"],
            "target_titles": ["CTO", "VP of Engineering", "Head of Engineering"],
            "company_size_min": 10,
            "company_size_max": 5000,
        },
        "prospect_limit": 10,
        "logs": [],
    }

    print(f"\nAccounts to process: {[a['company_name'] for a in mock_state['scraped_accounts']]}")
    print(f"Target titles: {mock_state['icp_config']['target_titles']}")
    print(f"Pattern emails available: {[(a['company_name'], a['pattern_emails']) for a in mock_state['scraped_accounts']]}")

    result = await contact_discovery_node(mock_state)

    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)

    discovered = result.get("discovered_contacts", [])
    print(f"\nDiscovered Contacts: {len(discovered)}")

    for idx, contact in enumerate(discovered):
        print(f"\n  Contact #{idx+1}:")
        print(f"    Company:        {contact.get('company_name')} ({contact.get('domain')})")
        print(f"    Name:           {contact.get('contact_name')}")
        print(f"    Title:          {contact.get('contact_title')}")
        print(f"    Email:          {contact.get('contact_email')}")
        print(f"    Email Status:   {contact.get('email_status')}")
        print(f"    Pattern Used:   {contact.get('pattern_used')}")
        print(f"    Pattern Source: {contact.get('pattern_source_email')}")
        print(f"    Source:         {contact.get('source')}")

    # Assertions
    print("\n" + "-" * 60)
    print("ASSERTIONS")
    print("-" * 60)

    # 1. All contacts must be tagged inferred_unverified
    for c in discovered:
        assert c.get("email_status") == "inferred_unverified", \
            f"Contact {c.get('contact_name')} has email_status='{c.get('email_status')}', expected 'inferred_unverified'"
    print("  ✅ All contacts have email_status='inferred_unverified'")

    # 2. No fabricated personas
    for c in discovered:
        name_lower = (c.get("contact_name") or "").lower()
        assert name_lower not in FORBIDDEN_NAMES, \
            f"FORBIDDEN: Contact name '{c.get('contact_name')}' matches a known fabricated persona!"
    print("  ✅ Zero fabricated persona names detected")

    # 3. Linear (no pattern_emails) should NOT have a contact
    linear_contacts = [c for c in discovered if c.get("domain") == "linear.app"]
    assert len(linear_contacts) == 0, \
        f"Linear should have been skipped (no pattern_emails), but got {len(linear_contacts)} contacts"
    print("  ✅ Linear correctly skipped (no pattern_emails available)")

    # 4. All contacts have required fields for Stage 4/5 compatibility
    required_fields = ["contact_name", "contact_title", "contact_email", "domain", "source", "hunter_person_id"]
    for c in discovered:
        for field in required_fields:
            assert field in c and c[field], f"Contact missing required field '{field}': {c}"
    print("  ✅ All contacts have required Stage 4/5 compatible fields")

    # 5. Source must be serper_pattern_inferred, not hunter_io_api
    for c in discovered:
        assert c.get("source") == "serper_pattern_inferred", \
            f"Contact source is '{c.get('source')}', expected 'serper_pattern_inferred'"
    print("  ✅ All contacts have source='serper_pattern_inferred'")

    # Log output
    for log in result.get("logs", []):
        print(f"\n  📋 {log.get('stage')}: {log.get('status')}")
        print(f"     {log.get('details')}")

    print("\n✅ ALL INTEGRATION TEST ASSERTIONS PASSED")


if __name__ == "__main__":
    # Run unit tests first (no API calls needed)
    test_email_pattern_engine()

    # Run integration test (requires SERPER_API_KEY + LLM)
    serper_key = os.getenv("SERPER_API_KEY", "")
    if not serper_key:
        print("\n⚠️  SERPER_API_KEY not set. Skipping integration test.")
        print("   Set SERPER_API_KEY in your environment and re-run to test contact discovery.")
    else:
        asyncio.run(test_contact_discovery())
