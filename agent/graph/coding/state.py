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
