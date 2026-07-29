"""
Tool: escalate_to_human

Signals that a customer issue requires human intervention.
Always classified as HIGH-RISK — routes through approval_checkpoint before execution.

The tool itself is lightweight; the real work (creating an ApprovalRequest in Postgres)
is done by the approval_checkpoint node after the reasoning node flags is_high_risk=True.
"""
from typing import Optional
from pydantic import BaseModel


class EscalateToHumanInput(BaseModel):
    reason: str
    action_payload: Optional[dict] = None


async def escalate_to_human_impl(
    reason: str,
    action_payload: Optional[dict] = None,
) -> str:
    """
    Returns a confirmation string. The approval_checkpoint node handles
    the actual Postgres write and graph pause.
    """
    return f"Escalation queued for human review. Reason: {reason}"
