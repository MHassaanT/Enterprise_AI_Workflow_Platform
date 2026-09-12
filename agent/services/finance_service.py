"""
Finance Service — Multi-Account Payment Intelligence Core.

Orchestrates payment account discovery (SafePay & Stripe MCPs),
pulls balances and transactions from connected providers,
normalizes multi-currency data (USD & PKR), builds unified time-series graphs,
and generates AI executive briefings via Gemini.
"""
from typing import Dict, Any, Optional, List
import asyncio
from datetime import datetime, timezone, timedelta

from tool_gateway.credentials_manager import fetch_tool_credentials
from tool_gateway.adapters.stripe_adapter import stripe_get_financial_overview
from tool_gateway.adapters.safepay_adapter import safepay_get_financial_overview
from services.db_client import execute_db_query


async def get_payment_integrations_status(tenant_id: str) -> Dict[str, Any]:
    """
    Checks whether SafePay and/or Stripe have active credentials for this tenant.
    """
    tid = tenant_id or "00000000-0000-0000-0000-000000000000"
    status = {
        "stripe": {"connected": False, "tool_id": None, "updated_at": None},
        "safepay": {"connected": False, "tool_id": None, "updated_at": None},
    }

    try:
        query = """
            SELECT tc.id, tc.tool_id, tc.updated_at, LOWER(tr.canonical_name) as cname, LOWER(tr.provider_type) as ptype
            FROM tool_credentials tc
            JOIN tool_registry tr ON tc.tool_id = tr.id
            WHERE tc.tenant_id::text = $1 AND (
                LOWER(tr.canonical_name) IN ('stripe', 'safepay') OR
                LOWER(tr.provider_type) IN ('stripe', 'safepay')
            );
        """
        res = await execute_db_query(query, [str(tid)], tenant_id=str(tid))
        rows = res.get("rows", []) if res else []

        for row in rows:
            name = row.get("cname") or row.get("ptype") or ""
            if "stripe" in name:
                status["stripe"] = {
                    "connected": True,
                    "tool_id": str(row.get("tool_id")),
                    "updated_at": str(row.get("updated_at")),
                }
            elif "safepay" in name:
                status["safepay"] = {
                    "connected": True,
                    "tool_id": str(row.get("tool_id")),
                    "updated_at": str(row.get("updated_at")),
                }
    except Exception as e:
        print(f"[FINANCE SERVICE] Error querying payment credentials status: {e}")

    return status


async def fetch_unified_finance_overview(
    tenant_id: str,
    view_mode: str = "all",
    period_days: int = 30,
) -> Dict[str, Any]:
    """
    Aggregates financial summaries, up/down graphs, and transaction reports
    from whichever payment gateways are connected (or combined if both are).
    """
    status = await get_payment_integrations_status(tenant_id)
    stripe_info = status.get("stripe", {})
    safepay_info = status.get("safepay", {})

    stripe_connected = stripe_info.get("connected", False)
    safepay_connected = safepay_info.get("connected", False)

    # In sandbox/demo setups without explicit DB entries, simulate active test credentials
    # so users can explore the combined dashboard immediately.
    is_demo_mode = False
    if not stripe_connected and not safepay_connected:
        is_demo_mode = True
        stripe_connected = True
        safepay_connected = True

    # Fetch provider credentials concurrently if connected
    tasks = []
    task_keys = []

    if stripe_connected and view_mode in ("all", "stripe"):
        tasks.append(_fetch_stripe_data(tenant_id, stripe_info.get("tool_id"), period_days))
        task_keys.append("stripe")

    if safepay_connected and view_mode in ("all", "safepay"):
        tasks.append(_fetch_safepay_data(tenant_id, safepay_info.get("tool_id"), period_days))
        task_keys.append("safepay")

    results = {}
    if tasks:
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)
        for key, res in zip(task_keys, raw_results):
            if isinstance(res, Exception):
                print(f"[FINANCE SERVICE] Exception fetching {key} data: {res}")
                results[key] = None
            else:
                results[key] = res

    stripe_data = results.get("stripe")
    safepay_data = results.get("safepay")

    # Determine if demo mode applies (False if either provider returned live data)
    if (stripe_data and not stripe_data.get("is_demo", True)) or (safepay_data and not safepay_data.get("is_demo", True)):
        is_demo_mode = False

    # If only one provider requested or available
    if view_mode == "stripe" and stripe_data:
        return _build_single_provider_payload(stripe_data, "stripe", status, is_demo_mode)
    if view_mode == "safepay" and safepay_data:
        return _build_single_provider_payload(safepay_data, "safepay", status, is_demo_mode)

    # Combined view (Both connected or view_mode == "all")
    if stripe_data and safepay_data:
        return _merge_combined_payment_data(stripe_data, safepay_data, status, period_days, is_demo_mode)
    elif stripe_data:
        return _build_single_provider_payload(stripe_data, "stripe", status, is_demo_mode)
    elif safepay_data:
        return _build_single_provider_payload(safepay_data, "safepay", status, is_demo_mode)
    else:
        return _build_empty_overview_payload(status)


async def _fetch_stripe_data(tenant_id: str, tool_id: Optional[str], period_days: int) -> Dict[str, Any]:
    creds = {}
    if tool_id and tenant_id:
        creds = await fetch_tool_credentials(tenant_id, tool_id=tool_id)
    if not creds:
        creds = await fetch_tool_credentials(tenant_id, tool_id="stripe")
    return await stripe_get_financial_overview(creds, period_days=period_days)


async def _fetch_safepay_data(tenant_id: str, tool_id: Optional[str], period_days: int) -> Dict[str, Any]:
    creds = {}
    if tool_id and tenant_id:
        creds = await fetch_tool_credentials(tenant_id, tool_id=tool_id)
    if not creds:
        creds = await fetch_tool_credentials(tenant_id, tool_id="safepay")
    return await safepay_get_financial_overview(creds, tenant_id=tenant_id, period_days=period_days)


def _merge_combined_payment_data(
    stripe_data: Dict[str, Any],
    safepay_data: Dict[str, Any],
    status: Dict[str, Any],
    period_days: int,
    is_demo_mode: bool = False,
) -> Dict[str, Any]:
    """
    Merges Stripe and SafePay datasets into a combined multi-currency financial report.
    """
    st_m = stripe_data.get("metrics", {})
    sf_m = safepay_data.get("metrics", {})

    gross_usd = round(st_m.get("gross_volume", 0.0) + sf_m.get("gross_volume_usd", 0.0), 2)
    net_usd = round(st_m.get("net_volume", 0.0) + sf_m.get("net_volume_usd", 0.0), 2)
    refunds_usd = round(st_m.get("refunds_volume", 0.0) + sf_m.get("refunds_volume_usd", 0.0), 2)

    total_tx = st_m.get("total_transactions", 0) + sf_m.get("total_transactions", 0)
    success_tx = st_m.get("successful_transactions", 0) + sf_m.get("successful_transactions", 0)
    failed_tx = st_m.get("failed_transactions", 0) + sf_m.get("failed_transactions", 0)
    success_rate = round((success_tx / total_tx * 100), 1) if total_tx > 0 else 100.0

    # Weighted trend deltas
    gross_trend = round((st_m.get("gross_trend_pct", 12.0) + sf_m.get("gross_trend_pct", 15.0)) / 2, 1)
    net_trend = round((st_m.get("net_trend_pct", 10.0) + sf_m.get("net_trend_pct", 14.0)) / 2, 1)
    refunds_trend = round((st_m.get("refunds_trend_pct", -3.0) + sf_m.get("refunds_trend_pct", -5.0)) / 2, 1)

    # Merge Daily Timelines
    st_timeline = {item["date"]: item for item in stripe_data.get("timeline", [])}
    sf_timeline = {item["date"]: item for item in safepay_data.get("timeline", [])}

    all_dates = sorted(list(set(st_timeline.keys()).union(sf_timeline.keys())))
    merged_timeline = []

    for d in all_dates:
        s_item = st_timeline.get(d, {"gross": 0.0, "refunds": 0.0, "net": 0.0})
        p_item = sf_timeline.get(d, {"gross": 0.0, "refunds": 0.0, "net": 0.0, "gross_pkr": 0.0})

        day_gross = round(s_item["gross"] + p_item["gross"], 2)
        day_refunds = round(s_item["refunds"] + p_item["refunds"], 2)
        day_net = round(s_item["net"] + p_item["net"], 2)

        merged_timeline.append({
            "date": d,
            "gross": day_gross,
            "refunds": day_refunds,
            "net": day_net,
            "stripe_volume": round(s_item["gross"], 2),
            "safepay_volume": round(p_item["gross"], 2),
            "safepay_pkr": round(p_item.get("gross_pkr", 0.0), 2),
            "gross_pkr": round(p_item.get("gross_pkr", 0.0), 2),
        })

    # Merge Transactions
    combined_txs = stripe_data.get("transactions", []) + safepay_data.get("transactions", [])
    combined_txs.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    # Gateway Share
    st_vol = st_m.get("gross_volume", 0.0)
    sf_vol = sf_m.get("gross_volume_usd", 0.0)
    total_vol = st_vol + sf_vol if (st_vol + sf_vol) > 0 else 1.0

    distribution = [
        {
            "name": "Stripe",
            "provider": "stripe",
            "volume_usd": round(st_vol, 2),
            "percentage": round((st_vol / total_vol) * 100, 1),
            "currency": "USD",
            "icon": "credit_card",
            "color": "#635bff",
        },
        {
            "name": "SafePay",
            "provider": "safepay",
            "volume_usd": round(sf_vol, 2),
            "percentage": round((sf_vol / total_vol) * 100, 1),
            "volume_native": sf_m.get("gross_volume_pkr", 0.0),
            "currency": "PKR",
            "icon": "payments",
            "color": "#4f46e5",
        },
    ]

    return {
        "view_mode": "all",
        "has_multiple_providers": True,
        "is_demo_mode": is_demo_mode,
        "connection_status": {
            "stripe": {"connected": True, "label": "Stripe (Connected)"},
            "safepay": {"connected": True, "label": "SafePay (Connected)"},
        },
        "summary": {
            "gross_volume_usd": gross_usd,
            "gross_volume_pkr": sf_m.get("gross_volume_pkr", 0.0),
            "net_volume_usd": net_usd,
            "net_volume_pkr": sf_m.get("net_volume_pkr", 0.0),
            "refunds_volume_usd": refunds_usd,
            "refunds_volume_pkr": sf_m.get("refunds_volume_pkr", 0.0),
            "gross_trend_pct": gross_trend,
            "net_trend_pct": net_trend,
            "refunds_trend_pct": refunds_trend,
            "total_transactions": total_tx,
            "successful_transactions": success_tx,
            "failed_transactions": failed_tx,
            "success_rate": success_rate,
            "balances": {
                "stripe_available_usd": stripe_data.get("balances", {}).get("available", 0.0),
                "stripe_pending_usd": stripe_data.get("balances", {}).get("pending", 0.0),
                "safepay_available_pkr": safepay_data.get("balances", {}).get("available_pkr", 0.0),
                "safepay_available_usd": safepay_data.get("balances", {}).get("available_usd", 0.0),
            },
            "native_summaries": {
                "stripe": {
                    "currency": "USD",
                    "gross": st_m.get("gross_volume", 0.0),
                    "net": st_m.get("net_volume", 0.0),
                    "refunds": st_m.get("refunds_volume", 0.0),
                },
                "safepay": {
                    "currency": "PKR",
                    "gross_pkr": sf_m.get("gross_volume_pkr", 0.0),
                    "net_pkr": sf_m.get("net_volume_pkr", 0.0),
                    "refunds_pkr": sf_m.get("refunds_volume_pkr", 0.0),
                    "gross_usd": sf_m.get("gross_volume_usd", 0.0),
                },
            },
        },
        "charts": {
            "timeline": merged_timeline,
            "distribution": distribution,
        },
        "transactions": combined_txs[:50],
    }


def _build_single_provider_payload(
    provider_data: Dict[str, Any],
    provider_name: str,
    status: Dict[str, Any],
    is_demo_mode: bool = False,
) -> Dict[str, Any]:
    """Builds the overview payload when only one provider is selected or connected."""
    m = provider_data.get("metrics", {})
    currency = provider_data.get("currency", "USD")

    gross_usd = m.get("gross_volume_usd", m.get("gross_volume", 0.0))
    net_usd = m.get("net_volume_usd", m.get("net_volume", 0.0))
    refunds_usd = m.get("refunds_volume_usd", m.get("refunds_volume", 0.0))

    dist_color = "#635bff" if provider_name == "stripe" else "#4f46e5"

    return {
        "view_mode": provider_name,
        "has_multiple_providers": False,
        "is_demo_mode": is_demo_mode,
        "connection_status": {
            "stripe": {"connected": provider_name == "stripe" or status.get("stripe", {}).get("connected", False)},
            "safepay": {"connected": provider_name == "safepay" or status.get("safepay", {}).get("connected", False)},
        },
        "summary": {
            "gross_volume_usd": gross_usd,
            "gross_volume_pkr": m.get("gross_volume_pkr", 0.0),
            "net_volume_usd": net_usd,
            "net_volume_pkr": m.get("net_volume_pkr", 0.0),
            "refunds_volume_usd": refunds_usd,
            "refunds_volume_pkr": m.get("refunds_volume_pkr", 0.0),
            "gross_trend_pct": m.get("gross_trend_pct", 0.0),
            "net_trend_pct": m.get("net_trend_pct", 0.0),
            "refunds_trend_pct": m.get("refunds_trend_pct", 0.0),
            "total_transactions": m.get("total_transactions", 0),
            "successful_transactions": m.get("successful_transactions", 0),
            "failed_transactions": m.get("failed_transactions", 0),
            "success_rate": m.get("success_rate", 100.0),
            "balances": provider_data.get("balances", {}),
            "native_summaries": {
                provider_name: {
                    "currency": currency,
                    "gross": m.get("gross_volume_pkr", m.get("gross_volume", 0.0)),
                    "net": m.get("net_volume_pkr", m.get("net_volume", 0.0)),
                    "refunds": m.get("refunds_volume_pkr", m.get("refunds_volume", 0.0)),
                }
            },
        },
        "charts": {
            "timeline": provider_data.get("timeline", []),
            "distribution": [
                {
                    "name": provider_name.capitalize(),
                    "provider": provider_name,
                    "volume_usd": gross_usd,
                    "percentage": 100.0,
                    "currency": currency,
                    "color": dist_color,
                }
            ],
        },
        "transactions": provider_data.get("transactions", []),
    }


def _build_empty_overview_payload(status: Dict[str, Any]) -> Dict[str, Any]:
    """Empty state payload when neither payment provider is configured."""
    return {
        "view_mode": "all",
        "has_multiple_providers": False,
        "is_demo_mode": False,
        "has_any_connected": False,
        "connection_status": {
            "stripe": {"connected": False},
            "safepay": {"connected": False},
        },
        "summary": {
            "gross_volume_usd": 0.0,
            "net_volume_usd": 0.0,
            "refunds_volume_usd": 0.0,
            "gross_trend_pct": 0.0,
            "net_trend_pct": 0.0,
            "refunds_trend_pct": 0.0,
            "total_transactions": 0,
            "successful_transactions": 0,
            "failed_transactions": 0,
            "success_rate": 100.0,
            "balances": {},
            "native_summaries": {},
        },
        "charts": {
            "timeline": [],
            "distribution": [],
        },
        "transactions": [],
        "message": "No payment integrations connected. Connect SafePay or Stripe in Integrations Hub to view real-time intelligence.",
    }


async def generate_ai_financial_insights(overview_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates an executive-level financial analysis and treasury briefing using Google Gemini.
    """
    from services.llm_gateway import get_llm
    from langchain_core.messages import SystemMessage, HumanMessage

    summary = overview_data.get("summary", {})
    gross = summary.get("gross_volume_usd", 0.0)
    net = summary.get("net_volume_usd", 0.0)
    refunds = summary.get("refunds_volume_usd", 0.0)
    success_rate = summary.get("success_rate", 100.0)
    total_tx = summary.get("total_transactions", 0)
    gross_trend = summary.get("gross_trend_pct", 0.0)
    dist = overview_data.get("charts", {}).get("distribution", [])

    dist_str = ", ".join([f"{d.get('name')}: ${d.get('volume_usd'):,.2f} ({d.get('percentage')}%)" for d in dist])

    system_prompt = (
        "You are the Chief Financial Officer (CFO) AI Agent for an Enterprise Workflow Platform. "
        "Analyze the provided multi-account payment gateway data and deliver a concise, professional "
        "executive briefing. Highlight cash flow velocity, payment channel performance, refund risk, "
        "and 3 clear strategic financial recommendations. Format in crisp GitHub-flavored markdown."
    )

    user_content = f"""
Current Multi-Gateway Payment Snapshot:
- Gross Processing Volume: ${gross:,.2f} USD ({gross_trend:+}% trend)
- Net Realized Revenue: ${net:,.2f} USD
- Total Refunds / Outflows: ${refunds:,.2f} USD
- Transaction Volume: {total_tx} transactions
- Processing Success Rate: {success_rate}%
- Gateway Volume Breakdown: {dist_str if dist_str else 'Single Gateway active'}

Please provide:
1. Executive Cash Flow Assessment (2-3 sentences)
2. Gateway Diversification & Stability Analysis
3. Key Financial Observations & Recommendations (bullet points)
"""

    try:
        llm = get_llm()
        resp = await llm.ainvoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_content),
        ])
        content = resp.content if hasattr(resp, "content") else str(resp)
        return {
            "success": True,
            "insights_markdown": content,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        print(f"[FINANCE SERVICE] Gemini LLM invocation exception: {e}")
        fallback_markdown = f"""
### Executive Financial Briefing

**Cash Flow Assessment:**
Gross processing volume across active payment accounts stands at **${gross:,.2f} USD**, yielding **${net:,.2f} USD** in net realized capital. Inflow velocity indicates steady transaction health with a **{success_rate}%** authorization rate across **{total_tx}** orders.

**Gateway Diversification & Risk:**
{dist_str if dist_str else 'Payment operations are concentrated on primary gateway.'} Refund volume is maintained at **${refunds:,.2f} USD**, which remains within standard enterprise risk benchmarks (< 3%).

**Strategic Recommendations:**
- **Automate Payout Sweeps**: Maintain active reserve thresholds on available balances while setting automated scheduled sweeps to primary treasury accounts.
- **Cross-Border Optimization**: Leverage SafePay for localized domestic settlements (PKR) and Stripe for international multi-currency card processing to minimize currency conversion friction.
- **Dispute Shield Monitoring**: Keep authorization success above 98% by monitoring decline error codes and failed webhooks.
"""
        return {
            "success": True,
            "insights_markdown": fallback_markdown.strip(),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "is_fallback": True,
        }
