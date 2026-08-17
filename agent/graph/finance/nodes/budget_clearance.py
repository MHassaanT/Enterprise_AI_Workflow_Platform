"""
Finance Sub-Agent 4: Budget Allocation & Clearance Sub-Agent
"""
from typing import Dict, Any
import json
from graph.finance.state import FinanceAgentState
from tool_gateway.finance_mcp import query_department_budget_impl
from services.db_client import execute_db_query

async def budget_clearance_node(state: FinanceAgentState) -> Dict[str, Any]:
    tenant_id = state.get("tenant_id", "default")
    dept = state.get("department") or "Engineering"
    amount = float(state.get("clearance_amount") or 0.0)
    
    # Query current balance sheet & department allocations
    budget_info = await query_department_budget_impl(dept, tenant_id)
    rem_budget = float(budget_info.get("remaining_budget", 0.0))
    
    granted = rem_budget >= amount
    status_str = "BUDGET_GRANTED" if granted else "BUDGET_DENIED"
    
    if granted:
        # Reserve requested amount in department_budgets
        query_reserve = """
        UPDATE department_budgets
        SET reserved_amount = reserved_amount + $1, updated_at = NOW()
        WHERE department = $2 AND tenant_id = $3;
        """
        await execute_db_query(query_reserve, [amount, dept, tenant_id])
        
    clearance_result = {
        "status": status_str,
        "department": dept,
        "requested_amount": amount,
        "remaining_budget": rem_budget,
        "clearance_granted": granted,
        "clearance_token": f"CLR-{dept[:3].upper()}-{int(amount)}" if granted else None
    }
    
    # Audit log
    query_audit = """
    INSERT INTO audit_logs (tenant_id, agent_name, subagent_name, action, details, reasoning)
    VALUES ($1, 'FinanceAgent', 'budget_clearance_subagent', $2, $3, $4);
    """
    await execute_db_query(query_audit, [
        tenant_id, status_str, json.dumps(clearance_result),
        f"Budget clearance request for ${amount:.2f} in {dept}: {status_str}."
    ])

    return {
        "budget_clearance_result": clearance_result,
        "answer": f"Budget clearance request of ${amount:.2f} for {dept}: {'APPROVED' if granted else 'REJECTED'}. (Remaining: ${rem_budget:.2f})",
    }
