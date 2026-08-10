import json
import asyncpg
from typing import Dict, Any, Optional
from config import settings
from models import WorkflowDefinition, WorkflowExecutionState, StepLog, PendingApproval
from datetime import datetime

async def get_db_pool():
    return await asyncpg.create_pool(settings.DATABASE_URL)

async def load_workflow(workflow_id: str) -> WorkflowDefinition:
    """Load workflow definition from the database."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        record = await conn.fetchrow(
            "SELECT definition FROM workflows WHERE workflow_id = $1", 
            workflow_id
        )
        if not record:
            raise ValueError(f"Workflow {workflow_id} not found")
        
        definition = json.loads(record['definition'])
        return WorkflowDefinition(**definition)

async def create_workflow_run(
    workflow_id: str, 
    tenant_id: str, 
    triggered_by: str, 
    trigger_context: Dict[str, Any]
) -> str:
    """Create a new run and return its run_id."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        run_id = await conn.fetchval(
            """
            INSERT INTO workflow_runs 
            (workflow_id, tenant_id, triggered_by, trigger_context, status) 
            VALUES ($1, $2, $3, $4, 'running') 
            RETURNING run_id
            """,
            workflow_id, tenant_id, triggered_by, json.dumps(trigger_context)
        )
        return str(run_id)

async def update_workflow_run(run_id: str, state: WorkflowExecutionState):
    """Persist the execution state and update status."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE workflow_runs 
            SET execution_state = $1, status = $2, completed_at = $3, result_data = $4
            WHERE run_id = $5
            """,
            state.model_dump_json(), 
            state.status,
            state.completed_at,
            json.dumps(state.variables.get("__final_result")) if state.variables.get("__final_result") else None,
            run_id
        )

async def save_step_log(run_id: str, step_log: StepLog):
    """Save an immutable step log."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO workflow_run_steps 
            (step_id, run_id, node_id, node_type, input_data, output_data, status, duration_ms, error_message, executed_at) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            step_log.step_id,
            run_id,
            step_log.node_id,
            step_log.node_type,
            json.dumps(step_log.input) if step_log.input else None,
            json.dumps(step_log.output) if step_log.output else None,
            step_log.status,
            step_log.duration_ms,
            step_log.error,
            step_log.executed_at
        )

async def create_approval_request(tenant_id: str, approval: PendingApproval):
    """Create a pending approval request that links to the workflow run."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        # Save to approval_requests
        await conn.execute(
            """
            INSERT INTO approval_requests 
            (id, tenant_id, action_type, action_payload, status, workflow_run_id) 
            VALUES ($1, $2, $3, $4, 'pending', $5)
            """,
            approval.approval_id,
            tenant_id,
            f"workflow_approval_{approval.node_id}",
            json.dumps(approval.action_payload),
            approval.workflow_run_id
        )

async def load_workflow_run_state(run_id: str) -> WorkflowExecutionState:
    """Load an existing execution state."""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        record = await conn.fetchrow(
            "SELECT execution_state FROM workflow_runs WHERE run_id = $1", 
            run_id
        )
        if not record or not record['execution_state']:
            raise ValueError(f"Workflow run {run_id} state not found")
            
        state_dict = json.loads(record['execution_state'])
        return WorkflowExecutionState(**state_dict)
