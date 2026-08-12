import uuid
import time
import json
from datetime import datetime, timedelta
from typing import Dict, Any

from models import (
    WorkflowExecutionState,
    StepLog,
    PendingApproval,
    NodeDef,
    TriggerNode,
    AgentNode,
    ToolNode,
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
from tool_gateway.centralized_gateway import execute_mcp_tool
from services.llm_gateway import get_llm

async def call_agent(module_type: str, tenant_id: str, input_data: dict) -> dict:
    """Mock agent call for now."""
    return {"response": f"Agent {module_type} processed input: {input_data}"}

async def call_mcp_tool(mcp_server: str, tool_name: str, parameters: dict, tenant_id: str) -> dict:
    """Invoke Centralized Gateway to call the MCP tool."""
    # We pass the workflow_id or a dummy agent_instance_id since the gateway expects an agent
    # In a real impl, workflows would have their own bindings or bypass agent checks
    # Here we bypass the 'execute_mcp_tool' bindings by assuming the tool is allowed 
    # Or just passing a dummy for the FYP scope. The execution_engine currently just calls it.
    
    # execute_mcp_tool returns a string response
    response_str = await execute_mcp_tool(
        tenant_id=tenant_id,
        agent_instance_id="workflow-builder", # Dummy for workflow orchestration
        tool_name=tool_name,
        arguments=parameters
    )
    
    # Simple check for security errors returned by the gateway
    if response_str.startswith("Security Error:"):
        raise PermissionError(response_str)
    
    return {"result": response_str}

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
    
    # For Trigger, Agent, Tool (success), WebhookReply, just take the first edge
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
            
        elif isinstance(node, ToolNode):
            try:
                if node.mcp:
                    # Use LLM to map `node.actionDescription` and state variables to specific JSON parameters
                    llm = get_llm()
                    prompt = f"""
You are an AI tool mapper. Your job is to translate a natural language action description into a JSON object of arguments for a tool.

Tool/App: {node.mcp}
Action Description: {node.actionDescription}

Current Workflow Variables:
{json.dumps(state.variables, default=str, indent=2)}

Instructions:
1. Determine the best API arguments needed to perform the action in the specified app.
2. If variables are needed (e.g. an email address from the trigger), extract them from the Current Workflow Variables.
3. Return ONLY a valid JSON object containing the arguments. Do not include markdown formatting or backticks.
"""
                    llm_response = await llm.ainvoke(prompt)
                    content = llm_response.content.strip()
                    if content.startswith("```json"):
                        content = content[7:-3].strip()
                    elif content.startswith("```"):
                        content = content[3:-3].strip()
                        
                    try:
                        params = json.loads(content)
                    except json.JSONDecodeError:
                        params = {"action": node.actionDescription} # fallback
                        
                    # Call the actual MCP tool
                    response_str = await execute_mcp_tool(
                        tenant_id=state.tenant_id,
                        agent_instance_id="workflow-builder",
                        tool_name=node.mcp,
                        arguments=params
                    )
                    output = {"result": response_str}
                else:
                    output = {"result": f"Executed generic action: {node.actionDescription}"}
                    
                if node.outputVariable:
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
    
    if trigger_node.triggerMode != trigger_type and trigger_type.lower() != "manual":
        raise ValueError(f"Expected trigger type {trigger_node.triggerMode}, got {trigger_type}")
        
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
