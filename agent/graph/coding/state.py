from typing import TypedDict, List, Dict, Any, Optional
from langchain_core.messages import BaseMessage

class CodingAgentState(TypedDict):
    messages: List[Dict[str, Any]]
    repo: str
    base_branch: str
    working_branch: str
    plan_mode: bool
    plan: Optional[Dict[str, Any]]
    target_files: List[str]
    modified_files: List[Dict[str, Any]]
    pr_info: Optional[Dict[str, Any]]
    status: str  # 'idle' | 'planning' | 'branch_created' | 'executing' | 'pr_created' | 'error'
    error_message: Optional[str]
    github_token: Optional[str]

    # Issue investigation mode (cross-agent escalation from Customer Support)
    issue_investigation_mode: bool
    issue_id: Optional[str]                 # UUID of the reported_issue being investigated
    issue_title: Optional[str]
    issue_description: Optional[str]
    issue_customer_message: Optional[str]
    investigation_findings: Optional[str]
    investigated_files: List[Dict[str, Any]]
    root_cause: Optional[str]
    investigation_approval_id: Optional[str]
    tenant_id: Optional[str]
