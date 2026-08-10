import uuid
import time
from datetime import datetime, timedelta
from typing import Dict, Any

from models import (
    WorkflowExecutionState,
    StepLog,
    PendingApproval,
    NodeDef,
    TriggerNode,
    AgentNode,
    ActionNode,
    ApprovalNode,
    ConditionNode,
    DelayNode,
    WebhookReplyNode,
    EndNode
)
from workflow_utils import substitute_variables, evaluate_expression
from db_workflows import (
    load_workflow,
    create_workflow_run,
    update_workflow_run,
    save_step_log,
    create_approval_request,
    load_workflow_run_state
)
# For MCP tools and agents (mocked for now, as deliverable 4/5 integration comes later)
# We will create placeholders for call_agent and call_mcp_tool.

async def call_agent(module_type: str, tenant_id: str, input_data: dict) -> dict:
    """Mock agent call."""
    return {"response": f"Agent {module_type} processed input: {input_data}"}

async def call_mcp_tool(mcp_server: str, tool_name: str, parameters: dict, tenant_id: str) -> dict:
    """Mock MCP tool call."""
    return {"result": f"Executed {tool_name} on {mcp_server} with {parameters}"}

def get_next_node(state: WorkflowExecutionState, node: NodeDef, edges: Dict[str, list]) -> str | None:
    """Determine the next node ID to execute."""
    if isinstance(node, EndNode):
        return None
    if isinstance(node, ApprovalNode):
        return None  # Paused
    if isinstance(node, DelayNode):
        return None  # Paused
    if isinstance(node, ConditionNode):
        # Condition nodes explicitly set current_node_id in their handler
        return state.current_node_id
    
    # For Trigger, Agent, Action (success), WebhookReply, just take the first edge
    node_edges = edges.get(node.node_id, [])
    if node_edges:
        return node_edges[0]
    return None

async def execute_node(state: WorkflowExecutionState, node: NodeDef, edges: Dict[str, list]) -> WorkflowExecutionState:
    """Execute a single node based on its type."""
    start_time = time.time()
    step_id = str(uuid.uuid4())
    error = None
    output = None
    status = "completed"
    
    try:
        if isinstance(node, TriggerNode):
            # Triggers don't execute, just validate
            state.current_node_id = get_next_node(state, node, edges)
            output = state.trigger_context
            
        elif isinstance(node, AgentNode):
            input_data = substitute_variables(node.inputMapping, state.variables)
            output = await call_agent(node.moduleType, state.tenant_id, input_data)
            state.variables[node.outputVariable] = output
            state.current_node_id = get_next_node(state, node, edges)
            
        elif isinstance(node, ActionNode):
            try:
                params = substitute_variables(node.parameters, state.variables)
                output = await call_mcp_tool(node.mcp, node.toolName, params, state.tenant_id)
                state.variables[node.outputVariable] = output
                state.current_node_id = get_next_node(state, node, edges)
            except Exception as e:
                error = str(e)
                status = "failed"
                if node.fallbackAction:
                    state.current_node_id = node.fallbackAction
                else:
                    state.status = "failed"
                    state.error_message = error
                    
        elif isinstance(node, ApprovalNode):
            payload = substitute_variables(node.approvalPayload, state.variables)
            approval = PendingApproval(
                approval_id=str(uuid.uuid4()),
                workflow_run_id=state.run_id,
                node_id=node.node_id,
                required_role=node.requiredRole,
                action_payload=payload,
                timeout_at=datetime.now() + timedelta(seconds=node.timeout),
                onApprove_node=node.onApprove,
                onReject_node=node.onReject,
                onTimeout_node=node.onTimeout
            )
            await create_approval_request(state.tenant_id, approval)
            state.approval_queue.append(approval)
            state.status = "awaiting_approval"
            state.current_node_id = None
            output = {"approval_id": approval.approval_id}
            
        elif isinstance(node, ConditionNode):
            result = evaluate_expression(node.expression, state.variables)
            state.current_node_id = node.onTrue if result else node.onFalse
            output = {"condition_result": result}
            
        elif isinstance(node, DelayNode):
            # For Deliverable 3, we simply pause execution. In reality, a scheduler would wake it up.
            state.status = "running"
            state.current_node_id = None
            output = {"paused_for": node.duration}
            
        elif isinstance(node, WebhookReplyNode):
            payload = substitute_variables(node.payload, state.variables)
            state.variables["__webhook_response"] = {
                "statusCode": node.statusCode,
                "body": payload
            }
            state.current_node_id = get_next_node(state, node, edges)
            output = payload
            
        elif isinstance(node, EndNode):
            if node.resultVariable:
                result = state.variables.get(node.resultVariable)
            else:
                result = None
            state.variables["__final_result"] = result
            state.status = "success"
            state.completed_at = datetime.now()
            state.current_node_id = None
            output = {"final_result": result}
            
    except Exception as e:
        status = "failed"
        error = str(e)
        state.status = "failed"
        state.error_message = error
        state.current_node_id = None
        
    duration_ms = int((time.time() - start_time) * 1000)
    
    # Create step log
    log = StepLog(
        step_id=step_id,
        node_id=node.node_id,
        node_type=node.type,
        input=state.variables if isinstance(node, ConditionNode) else getattr(node, 'dict', lambda: {})(),
        output=output,
        status=status,
        duration_ms=duration_ms,
        executed_at=datetime.now(),
        error=error
    )
    state.execution_log.append(log)
    await save_step_log(state.run_id, log)
    
    return state


async def execute_workflow(workflow_id: str, trigger_type: str, trigger_context: dict, user_id: str) -> str:
    """Main entry point for workflow execution."""
    workflow = await load_workflow(workflow_id)
    
    # Ensure there is exactly 1 trigger node and its type matches
    trigger_nodes = [n for n in workflow.nodes.values() if isinstance(n, TriggerNode)]
    if not trigger_nodes:
        raise ValueError("Workflow has no trigger node.")
    trigger_node = trigger_nodes[0]
    
    if trigger_node.trigger_type != trigger_type:
        raise ValueError(f"Expected trigger type {trigger_node.trigger_type}, got {trigger_type}")
        
    # In a real app we'd get tenant_id from user_id or workflow
    tenant_id = "00000000-0000-0000-0000-000000000000" # Dummy tenant_id for now
    
    run_id = await create_workflow_run(workflow_id, tenant_id, trigger_type, trigger_context)
    
    state = WorkflowExecutionState(
        workflow_id=workflow_id,
        run_id=run_id,
        tenant_id=tenant_id,
        current_node_id=trigger_node.node_id,
        variables={"trigger": trigger_context, "workflow": {"id": workflow_id}},
        trigger_context=trigger_context,
        status="running"
    )
    
    # Execution Loop
    while state.current_node_id is not None and state.status == "running":
        node = workflow.nodes[state.current_node_id]
        state.node_execution_order.append(state.current_node_id)
        
        state = await execute_node(state, node, workflow.edges)
        await update_workflow_run(run_id, state)
        
    return run_id

async def resume_workflow_after_approval(approval_id: str, approved: bool) -> str:
    """Resume a workflow after a human approval decision."""
    # Dummy mock - you would fetch the pending approval from DB, verify it, load run, and resume
    pass
