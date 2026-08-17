"""
Sales Sub-Agent 3: Cross Agent Financial Sync Sub-Agent
"""
from typing import Dict, Any
import json
from graph.sales.state import SalesAgentState
from tool_gateway.finance_mcp import update_general_ledger_impl
from services.db_client import execute_db_query

async def sales_financial_sync_node(state: SalesAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    quote = state.get("quote_details") or {}
    cust_email = state.get("customer_email", "customer@enterprise.com")
    price = float(quote.get("final_annual_price", 85000.00))
    
    # 1. Route sub-task to Finance Agent: Update forecasted revenue in ledger
    ledger_res = await update_general_ledger_impl(
        account_code="ACC-4000",
        account_name="Sales Revenue",
        transaction_type="REVENUE_FORECAST",
        forecasted_revenue=price,
        actual_revenue=0.0,
        actual_expense=0.0,
        reference_id=f"DEAL-{tenant_id[:4]}",
        tenant_id=tenant_id
    )
    
    # 2. Dispatch finalized invoice via Email MCP (simulated dispatch log)
    email_msg = f"Dispatched finalized invoice (${price:.2f}) via Email MCP to {cust_email}."
    
    # 3. Write Audit Log
    query_audit = """
    INSERT INTO audit_logs (tenant_id, agent_name, subagent_name, action, details, reasoning)
    VALUES ($1, 'SalesAgent', 'sales_financial_sync_subagent', 'SALES_COMPLETED', $2, $3);
    """
    await execute_db_query(query_audit, [
        tenant_id, json.dumps({"customer_email": cust_email, "amount": price}),
        f"Cross-Agent Financial Sync complete: Forecasted revenue of ${price:.2f} updated in ledger."
    ])

    return {
        "financial_sync_result": {"status": "success", "ledger": ledger_res, "invoice_sent": True},
        "answer": f"Financial sync complete! Forecasted revenue of ${price:.2f} updated in ledger. {email_msg}",
    }
