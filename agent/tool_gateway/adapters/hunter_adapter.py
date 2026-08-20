"""
Hunter.io Adapter — translates B2B lead intelligence, discovery, email verification,
and enrichment requests to the Hunter.io API v2 endpoints using tenant API key credentials.

Supported Hunter.io API v2 Endpoints:
1. Discover: POST /v2/discover
2. Domain Search: GET /v2/domain-search
3. Email Finder: GET /v2/email-finder
4. Email Verification: GET /v2/email-verifier
5. Company Enrichment: GET /v2/companies/find
6. Person Enrichment: GET /v2/people/find
7. Combined Enrichment: GET /v2/combined/find
8. Account Info: GET /v2/account
"""
from typing import Dict, Any
import httpx
import json
import logging

logger = logging.getLogger(__name__)

HUNTER_BASE_URL = "https://api.hunter.io/v2"


async def execute_hunter_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    """
    Executes Hunter.io tool calls (discover, domain search, email finder, email verifier, company/person/combined enrichment, account info).
    """
    api_key = (
        credentials.get("api_key")
        or credentials.get("secret_key")
        or credentials.get("token")
        or credentials.get("access_token")
    )

    action = arguments.get("action") or tool_name
    norm_action = action.lower().replace("-", "_").replace(" ", "_")

    # If no API key set or test key, perform sandbox dry-run execution
    if not api_key or api_key.startswith("v2_test_") or len(api_key.strip()) < 5:
        return await _execute_sandbox_fallback(norm_action, arguments)

    params = {"api_key": api_key.strip()}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:

            # 1. Discover Leads: POST /v2/discover
            if norm_action in ("discover", "hunter_discover", "lead_discover"):
                payload = arguments.get("query") or arguments.get("payload") or {}
                if not isinstance(payload, dict):
                    payload = {"query": str(payload)}
                if arguments.get("limit"):
                    payload["limit"] = arguments.get("limit")

                res = await client.post(f"{HUNTER_BASE_URL}/discover", params=params, json=payload)
                if res.is_success:
                    return json.dumps({
                        "status": "success",
                        "source": "hunter_io_api",
                        "endpoint": "POST /v2/discover",
                        "data": res.json().get("data", {})
                    }, indent=2)
                else:
                    return f"Hunter Discover Error ({res.status_code}): {res.text}"

            # 2. Domain Search: GET /v2/domain-search
            elif "domain_search" in norm_action or norm_action == "hunter_domain_search":
                domain = arguments.get("domain") or arguments.get("company_domain")
                if not domain:
                    return "Error: 'domain' is required for Hunter Domain Search."
                
                clean_domain = domain.replace("http://", "").replace("https://", "").strip("/")
                params["domain"] = clean_domain
                if arguments.get("limit"):
                    params["limit"] = arguments.get("limit")
                if arguments.get("type"):
                    params["type"] = arguments.get("type")

                res = await client.get(f"{HUNTER_BASE_URL}/domain-search", params=params)
                if res.is_success:
                    data = res.json().get("data", {})
                    emails = data.get("emails", [])
                    org = data.get("organization") or clean_domain
                    pattern = data.get("pattern")
                    
                    email_summary = []
                    for item in emails[:10]:
                        email_summary.append({
                            "email": item.get("value"),
                            "type": item.get("type"),
                            "confidence": item.get("confidence"),
                            "first_name": item.get("first_name"),
                            "last_name": item.get("last_name"),
                            "position": item.get("position"),
                        })

                    return json.dumps({
                        "status": "success",
                        "source": "hunter_io_api",
                        "endpoint": "GET /v2/domain-search",
                        "organization": org,
                        "domain": clean_domain,
                        "email_pattern": pattern,
                        "total_emails_found": len(emails),
                        "emails": email_summary,
                    }, indent=2)
                else:
                    return f"Hunter Domain Search Error ({res.status_code}): {res.text}"

            # 3. Email Finder: GET /v2/email-finder
            elif "email_finder" in norm_action or norm_action == "hunter_email_finder" or "find_email" in norm_action:
                domain = arguments.get("domain")
                first_name = arguments.get("first_name")
                last_name = arguments.get("last_name")
                company = arguments.get("company")

                if not domain and not company:
                    return "Error: Either 'domain' or 'company' is required for Hunter Email Finder."
                if not first_name or not last_name:
                    return "Error: Both 'first_name' and 'last_name' are required for Hunter Email Finder."

                if domain:
                    params["domain"] = domain.replace("http://", "").replace("https://", "").strip("/")
                if company:
                    params["company"] = company
                params["first_name"] = first_name
                params["last_name"] = last_name

                res = await client.get(f"{HUNTER_BASE_URL}/email-finder", params=params)
                if res.is_success:
                    data = res.json().get("data", {})
                    return json.dumps({
                        "status": "success",
                        "source": "hunter_io_api",
                        "endpoint": "GET /v2/email-finder",
                        "email": data.get("email"),
                        "score": data.get("score"),
                        "domain": data.get("domain"),
                        "position": data.get("position"),
                        "verification_status": data.get("verification", {}).get("status"),
                    }, indent=2)
                else:
                    return f"Hunter Email Finder Error ({res.status_code}): {res.text}"

            # 4. Email Verifier: GET /v2/email-verifier
            elif "verify_email" in norm_action or norm_action == "hunter_verify_email" or "email_verifier" in norm_action:
                email = arguments.get("email")
                if not email:
                    return "Error: 'email' is required for Hunter Email Verifier."

                params["email"] = email.strip()
                res = await client.get(f"{HUNTER_BASE_URL}/email-verifier", params=params)
                if res.is_success:
                    data = res.json().get("data", {})
                    res_result = data.get("result") or data.get("status") or "valid"
                    res_score = data.get("score") if data.get("score") is not None else 90
                    return json.dumps({
                        "status": "success",
                        "source": "hunter_io_api",
                        "endpoint": "GET /v2/email-verifier",
                        "email": data.get("email"),
                        "result": res_result,          # valid, invalid, accept_all, webmail, disposable
                        "score": res_score,            # 0 to 100
                        "regexp_valid": data.get("regexp", True),
                        "gibberish": data.get("gibberish", False),
                        "disposable": data.get("disposable", False),
                        "webmail": data.get("webmail", False),
                        "mx_records": data.get("mx_records", True),
                        "smtp_server": data.get("smtp_server", True),
                        "smtp_check": data.get("smtp_check", True),
                    }, indent=2)
                else:
                    return f"Hunter Email Verifier Error ({res.status_code}): {res.text}"

            # 5. Company Enrichment: GET /v2/companies/find
            elif "company_enrichment" in norm_action or norm_action == "hunter_company_enrichment" or "company" in norm_action:
                domain = arguments.get("domain") or arguments.get("company_domain")
                if not domain:
                    return "Error: 'domain' is required for Hunter Company Enrichment."

                clean_domain = domain.replace("http://", "").replace("https://", "").strip("/")
                params["domain"] = clean_domain

                res = await client.get(f"{HUNTER_BASE_URL}/companies/find", params=params)
                if res.is_success:
                    return json.dumps({
                        "status": "success",
                        "source": "hunter_io_api",
                        "endpoint": "GET /v2/companies/find",
                        "company": res.json().get("data", {})
                    }, indent=2)
                else:
                    return f"Hunter Company Enrichment Error ({res.status_code}): {res.text}"

            # 6. Person Enrichment: GET /v2/people/find
            elif "person_enrichment" in norm_action or norm_action == "hunter_person_enrichment" or "person" in norm_action:
                email = arguments.get("email")
                if not email:
                    return "Error: 'email' is required for Hunter Person Enrichment."

                params["email"] = email.strip()

                res = await client.get(f"{HUNTER_BASE_URL}/people/find", params=params)
                if res.is_success:
                    return json.dumps({
                        "status": "success",
                        "source": "hunter_io_api",
                        "endpoint": "GET /v2/people/find",
                        "person": res.json().get("data", {})
                    }, indent=2)
                else:
                    return f"Hunter Person Enrichment Error ({res.status_code}): {res.text}"

            # 7. Combined Enrichment: GET /v2/combined/find
            elif "combined" in norm_action or norm_action == "hunter_combined_enrichment":
                email = arguments.get("email")
                if not email:
                    return "Error: 'email' is required for Hunter Combined Enrichment."

                params["email"] = email.strip()

                res = await client.get(f"{HUNTER_BASE_URL}/combined/find", params=params)
                if res.is_success:
                    return json.dumps({
                        "status": "success",
                        "source": "hunter_io_api",
                        "endpoint": "GET /v2/combined/find",
                        "combined": res.json().get("data", {})
                    }, indent=2)
                else:
                    return f"Hunter Combined Enrichment Error ({res.status_code}): {res.text}"

            # 8. Account Info: GET /v2/account
            elif "account" in norm_action or norm_action == "hunter_account_info":
                res = await client.get(f"{HUNTER_BASE_URL}/account", params=params)
                if res.is_success:
                    data = res.json().get("data", {})
                    calls = data.get("requests", {})
                    return json.dumps({
                        "status": "success",
                        "source": "hunter_io_api",
                        "endpoint": "GET /v2/account",
                        "first_name": data.get("first_name"),
                        "last_name": data.get("last_name"),
                        "email": data.get("email"),
                        "plan_name": data.get("plan_name"),
                        "searches_used": calls.get("searches", {}).get("used"),
                        "searches_available": calls.get("searches", {}).get("available"),
                        "verifications_used": calls.get("verifications", {}).get("used"),
                        "verifications_available": calls.get("verifications", {}).get("available"),
                    }, indent=2)
                else:
                    return f"Hunter Account Info Error ({res.status_code}): {res.text}"

            else:
                return f"Error: Unsupported Hunter.io action '{action}'."
    except Exception as e:
        logger.error(f"Hunter.io API execution exception: {e}")
        return f"Hunter.io execution exception: {str(e)}"


async def _execute_sandbox_fallback(action: str, arguments: Dict[str, Any]) -> str:
    """Provides fallback sandbox responses for Hunter.io API v2 endpoints."""
    if action in ("discover", "hunter_discover", "lead_discover"):
        return json.dumps({
            "status": "success",
            "source": "hunter_sandbox_mock",
            "endpoint": "POST /v2/discover",
            "results": [
                {"name": "Stripe", "domain": "stripe.com", "industry": "Financial Technology", "employees": "5000+"},
                {"name": "Reddit", "domain": "reddit.com", "industry": "Internet & Media", "employees": "2000+"}
            ],
            "note": "Sandbox mode: Connect Hunter.io API Key in Integration Hub for live Discover data."
        }, indent=2)
    elif "domain_search" in action or action == "hunter_domain_search":
        domain = arguments.get("domain") or "stripe.com"
        clean = domain.replace("http://", "").replace("https://", "").strip("/")
        return json.dumps({
            "status": "success",
            "source": "hunter_sandbox_mock",
            "endpoint": "GET /v2/domain-search",
            "organization": clean.split(".")[0].title(),
            "domain": clean,
            "email_pattern": "{first}.{last}@" + clean,
            "total_emails_found": 3,
            "emails": [
                {"email": f"alex.vance@{clean}", "type": "personal", "confidence": 95, "first_name": "Alex", "last_name": "Vance", "position": "VP of Sales"},
                {"email": f"elena.rostova@{clean}", "type": "personal", "confidence": 92, "first_name": "Elena", "last_name": "Rostova", "position": "Head of Growth"},
                {"email": f"contact@{clean}", "type": "generic", "confidence": 88, "first_name": None, "last_name": None, "position": "Support"}
            ],
            "note": "Sandbox mode: Connect Hunter.io API Key in Integration Hub for live Hunter data."
        }, indent=2)
    elif "email_finder" in action or action == "hunter_email_finder" or "find_email" in action:
        domain = arguments.get("domain") or "reddit.com"
        fn = arguments.get("first_name") or "Alexis"
        ln = arguments.get("last_name") or "Ohanian"
        return json.dumps({
            "status": "success",
            "source": "hunter_sandbox_mock",
            "endpoint": "GET /v2/email-finder",
            "email": f"{fn.lower()}.{ln.lower()}@{domain}",
            "score": 98,
            "domain": domain,
            "position": "Co-founder",
            "verification_status": "valid",
            "note": "Sandbox mode: Connect Hunter.io API Key in Integration Hub for live Hunter data."
        }, indent=2)
    elif "verify_email" in action or action == "hunter_verify_email" or "email_verifier" in action:
        email = arguments.get("email") or "patrick@stripe.com"
        return json.dumps({
            "status": "success",
            "source": "hunter_sandbox_mock",
            "endpoint": "GET /v2/email-verifier",
            "email": email,
            "result": "valid",
            "score": 99,
            "regexp_valid": True,
            "gibberish": False,
            "disposable": False,
            "webmail": False,
            "mx_records": True,
            "smtp_server": True,
            "smtp_check": True,
            "note": "Sandbox mode: Connect Hunter.io API Key in Integration Hub for live Hunter verification."
        }, indent=2)
    elif "company_enrichment" in action or action == "hunter_company_enrichment" or "company" in action:
        domain = arguments.get("domain") or "stripe.com"
        return json.dumps({
            "status": "success",
            "source": "hunter_sandbox_mock",
            "endpoint": "GET /v2/companies/find",
            "company": {
                "name": "Stripe",
                "domain": domain,
                "industry": "Financial Technology",
                "country": "United States",
                "employees": "5000+",
                "technologies": ["React", "Python", "AWS", "PostgreSQL"]
            },
            "note": "Sandbox mode: Connect Hunter.io API Key in Integration Hub for live Company Enrichment."
        }, indent=2)
    elif "person_enrichment" in action or action == "hunter_person_enrichment" or "person" in action:
        email = arguments.get("email") or "patrick@stripe.com"
        return json.dumps({
            "status": "success",
            "source": "hunter_sandbox_mock",
            "endpoint": "GET /v2/people/find",
            "person": {
                "email": email,
                "first_name": "Patrick",
                "last_name": "Collison",
                "position": "CEO & Co-founder",
                "company": "Stripe",
                "linkedin_url": "https://www.linkedin.com/in/patrickcollison",
                "twitter_handle": "@patrickc"
            },
            "note": "Sandbox mode: Connect Hunter.io API Key in Integration Hub for live Person Enrichment."
        }, indent=2)
    elif "combined" in action or action == "hunter_combined_enrichment":
        email = arguments.get("email") or "patrick@stripe.com"
        return json.dumps({
            "status": "success",
            "source": "hunter_sandbox_mock",
            "endpoint": "GET /v2/combined/find",
            "person": {
                "email": email,
                "first_name": "Patrick",
                "last_name": "Collison",
                "position": "CEO & Co-founder",
                "linkedin_url": "https://www.linkedin.com/in/patrickcollison"
            },
            "company": {
                "name": "Stripe",
                "domain": "stripe.com",
                "industry": "Financial Technology"
            },
            "note": "Sandbox mode: Connect Hunter.io API Key in Integration Hub for live Combined Enrichment."
        }, indent=2)
    else:
        return json.dumps({
            "status": "success",
            "source": "hunter_sandbox_mock",
            "endpoint": "GET /v2/account",
            "plan_name": "Free Sandbox",
            "searches_available": 100,
            "verifications_available": 100,
            "note": "Sandbox mode active."
        }, indent=2)
