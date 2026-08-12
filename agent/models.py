from typing import Dict, List, Literal, Optional, Union, Any
from datetime import datetime
from pydantic import BaseModel, Field, model_validator

class BaseNode(BaseModel):
    node_id: str
    type: str

class TriggerNode(BaseNode):
    type: Literal["TRIGGER"] = "TRIGGER"
    triggerMode: Literal["event", "schedule", "interval", "app_event"] = "event"
    triggerDescription: Optional[str] = None
    cronExpression: Optional[str] = None
    intervalMinutes: Optional[int] = None

class AgentConfig(BaseModel):
    systemPrompt: Optional[str] = None
    temperature: Optional[float] = None
    maxTokens: Optional[int] = None

class AgentNode(BaseNode):
    type: Literal["AGENT"] = "AGENT"
    moduleType: Literal["CustomerSupport", "WorkflowBuilder", "HR", "Finance", "Sales", "Procurement", "SoftwareEngineer", "KnowledgeBase", "Analytics"]
    config: Optional[AgentConfig] = None
    inputMapping: Dict[str, str] = Field(default_factory=dict)
    outputVariable: str

class ToolNode(BaseNode):
    type: Literal["TOOL"] = "TOOL"
    mcp: Optional[str] = None
    actionDescription: Optional[str] = None
    fallbackAction: Optional[str] = None
    outputVariable: Optional[str] = "tool_output"

class ApprovalNode(BaseNode):
    type: Literal["APPROVAL"] = "APPROVAL"
    requiredRole: Literal["Admin", "Reviewer", "Finance", "Employee"]
    approvalPayload: Dict[str, Any]
    timeout: int
    onApprove: str
    onReject: str
    onTimeout: str
    title: Optional[str] = None
    description: Optional[str] = None

class ConditionNode(BaseNode):
    type: Literal["CONDITION"] = "CONDITION"
    expression: str
    onTrue: str
    onFalse: str

class DelayNode(BaseNode):
    type: Literal["DELAY"] = "DELAY"
    duration: Union[int, str]
    resumeContext: Optional[Dict[str, Any]] = None

class WebhookReplyNode(BaseNode):
    type: Literal["WEBHOOK_REPLY"] = "WEBHOOK_REPLY"
    statusCode: Literal[200, 400, 500]
    payload: Dict[str, Any]

class EndNode(BaseNode):
    type: Literal["END"] = "END"
    resultVariable: Optional[str] = None
    notifyUser: bool = False
    notificationMessage: Optional[str] = None

NodeDef = Union[
    TriggerNode, 
    AgentNode, 
    ToolNode, 
    ApprovalNode, 
    ConditionNode, 
    DelayNode, 
    WebhookReplyNode, 
    EndNode
]

class WorkflowDefinition(BaseModel):
    nodes: Dict[str, NodeDef]
    edges: Dict[str, List[str]] = Field(default_factory=dict)

    @model_validator(mode='after')
    def validate_dag(self) -> 'WorkflowDefinition':
        nodes = self.nodes
        edges = self.edges

        # 1. Exactly one TRIGGER node
        trigger_nodes = [n for n in nodes.values() if n.type == "TRIGGER"]
        if len(trigger_nodes) != 1:
            raise ValueError(f"Workflow must have exactly one TRIGGER node, found {len(trigger_nodes)}")
        
        # 2. At least one END node
        end_nodes = [n for n in nodes.values() if n.type == "END"]
        if len(end_nodes) < 1:
            raise ValueError("Workflow must have at least one END node")

        # 3. All edge targets must reference existing node IDs
        # Helper to get all outgoing edges for a node
        def get_outgoing_edges(node_id: str) -> List[str]:
            node = nodes[node_id]
            outgoing = list(edges.get(node_id, []))
            
            if isinstance(node, ToolNode) and node.fallbackAction:
                outgoing.append(node.fallbackAction)
            elif isinstance(node, ApprovalNode):
                outgoing.extend([node.onApprove, node.onReject, node.onTimeout])
            elif isinstance(node, ConditionNode):
                outgoing.extend([node.onTrue, node.onFalse])
                
            return outgoing

        for node_id in nodes:
            outgoing = get_outgoing_edges(node_id)
            for target_id in outgoing:
                if target_id not in nodes:
                    raise ValueError(f"Node '{node_id}' references non-existent target node '{target_id}'")

        # 4. Cycle detection (Topological Sort / DFS)
        visited = set()
        rec_stack = set()

        def dfs(curr_id: str) -> bool:
            visited.add(curr_id)
            rec_stack.add(curr_id)

            for neighbor in get_outgoing_edges(curr_id):
                if neighbor not in visited:
                    if dfs(neighbor):
                        return True
                elif neighbor in rec_stack:
                    return True # Cycle detected

            rec_stack.remove(curr_id)
            return False

        # Check for cycles
        for node_id in nodes:
            if node_id not in visited:
                if dfs(node_id):
                    raise ValueError("Workflow contains a cycle. DAGs must be acyclic.")

        # 5. Nested approvals check
        approval_nodes = [n.node_id for n in nodes.values() if n.type == "APPROVAL"]
        for start_approval_id in approval_nodes:
            # BFS from this approval node
            queue = get_outgoing_edges(start_approval_id)
            bfs_visited = set()
            while queue:
                curr = queue.pop(0)
                if curr in bfs_visited:
                    continue
                bfs_visited.add(curr)
                if nodes[curr].type == "APPROVAL":
                    raise ValueError(f"Nested APPROVAL nodes detected: '{start_approval_id}' eventually leads to '{curr}'")
                queue.extend(get_outgoing_edges(curr))

        return self


# Workflow Execution State Models
class StepLog(BaseModel):
    step_id: str
    node_id: str
    node_type: str
    input: Dict[str, Any]
    output: Optional[Dict[str, Any]] = None
    status: Literal["completed", "failed", "skipped"]
    duration_ms: int
    executed_at: datetime
    error: Optional[str] = None

class PendingApproval(BaseModel):
    approval_id: str
    workflow_run_id: str
    node_id: str
    required_role: str
    action_payload: Dict[str, Any]
    timeout_at: datetime
    onApprove_node: str
    onReject_node: str
    onTimeout_node: str

class WorkflowExecutionState(BaseModel):
    workflow_id: str
    run_id: str
    tenant_id: str
    current_node_id: Optional[str] = None
    node_execution_order: List[str] = Field(default_factory=list)
    variables: Dict[str, Any] = Field(default_factory=dict)
    trigger_context: Dict[str, Any] = Field(default_factory=dict)
    execution_log: List[StepLog] = Field(default_factory=list)
    approval_queue: List[PendingApproval] = Field(default_factory=list)
    status: Literal["running", "success", "failed", "awaiting_approval", "timeout"]
    error_message: Optional[str] = None
    completed_at: Optional[datetime] = None
