"""
Supervisor Graph State Schema — Cross-Agent Orchestration
"""
from typing import TypedDict, Optional, Dict, Any, List

class SupervisorState(TypedDict):
    tenant_id: str
    conversation_id: str
    target_domain: str # 'finance' | 'procurement' | 'sales'
    action: str
    payload: Dict[str, Any]
    route_history: List[str]
    result: Optional[Dict[str, Any]]
    answer: str
