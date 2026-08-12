import json
import asyncpg
from typing import Dict, Any, Optional, List
from config import settings
from models import WorkflowDefinition, WorkflowExecutionState, StepLog, PendingApproval
from datetime import datetime

async def get_db_pool():
    return await asyncpg.create_pool(settings.DATABASE_URL)

def parse_reactflow_to_workflow_def(raw_def: Dict[str, Any]) -> Dict[str, Any]:
    """Convert ReactFlow JSON format to WorkflowDefinition expected dict format."""
    # If it's already in the correct format (dict for nodes), return it directly
    if isinstance(raw_def.get("nodes"), dict):
        return raw_def
        
    parsed_nodes = {}
    parsed_edges = {}
    
    # Parse nodes
    for rn in raw_def.get("nodes", []):
        node_id = rn.get("id")
        data = rn.get("data", {})
        
        # Merge data with node_id at root
        node_dict = {"node_id": node_id}
        
        # Ensure type is explicitly set from the ReactFlow root
        if "type" in rn:
            node_dict["type"] = str(rn["type"]).upper()
            
        node_dict.update(data)
        
        parsed_nodes[node_id] = node_dict
        
    # Parse edges
    for re in raw_def.get("edges", []):
        source = re.get("source")
        target = re.get("target")
        if source not in parsed_edges:
            parsed_edges[source] = []
        parsed_edges[source].append(target)
        
    return {
        "nodes": parsed_nodes,
        "edges": parsed_edges
    }

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
        parsed_def = parse_reactflow_to_workflow_def(definition)
        return WorkflowDefinition(**parsed_def)

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

# ---- CRUD and Analytics Methods (Deliverable 4, 7) ----

async def list_workflows(tenant_id: str, status: Optional[str] = None) -> List[dict]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        query = "SELECT workflow_id, name, description, status, created_at, updated_at FROM workflows WHERE tenant_id = $1"
        args = [tenant_id]
        if status:
            query += " AND status = $2"
            args.append(status)
        query += " ORDER BY updated_at DESC"
        
        records = await conn.fetch(query, *args)
        return [dict(r) for r in records]

async def create_workflow(tenant_id: str, name: str, description: str, definition: dict, created_by: Optional[str] = None) -> str:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        workflow_id = await conn.fetchval(
            """
            INSERT INTO workflows (tenant_id, name, description, definition, status, created_by)
            VALUES ($1, $2, $3, $4, 'draft', $5)
            RETURNING workflow_id
            """,
            tenant_id, name, description, json.dumps(definition), created_by
        )
        return str(workflow_id)

async def update_workflow(workflow_id: str, definition: dict, status: Optional[str] = None):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        if status:
            await conn.execute(
                "UPDATE workflows SET definition = $1, status = $2, updated_at = NOW() WHERE workflow_id = $3",
                json.dumps(definition), status, workflow_id
            )
        else:
            await conn.execute(
                "UPDATE workflows SET definition = $1, updated_at = NOW() WHERE workflow_id = $2",
                json.dumps(definition), workflow_id
            )

async def get_workflow_runs(workflow_id: str, limit: int = 50, offset: int = 0) -> List[dict]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        records = await conn.fetch(
            """
            SELECT run_id, status, triggered_by, created_at, completed_at 
            FROM workflow_runs 
            WHERE workflow_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2 OFFSET $3
            """,
            workflow_id, limit, offset
        )
        return [dict(r) for r in records]

async def get_run_steps(run_id: str) -> List[dict]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        records = await conn.fetch(
            """
            SELECT step_id, node_id, node_type, input_data, output_data, status, duration_ms, executed_at, error_message
            FROM workflow_run_steps 
            WHERE run_id = $1 
            ORDER BY executed_at ASC
            """,
            run_id
        )
        return [dict(r) for r in records]

async def get_analytics(tenant_id: str) -> dict:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        total_runs = await conn.fetchval("SELECT COUNT(*) FROM workflow_runs WHERE tenant_id = $1", tenant_id)
        
        if total_runs == 0:
            return {"totalRuns": 0, "successRate": 0, "avgDurationMs": 0}
            
        success_runs = await conn.fetchval("SELECT COUNT(*) FROM workflow_runs WHERE tenant_id = $1 AND status = 'success'", tenant_id)
        
        # Calculate avg duration for successful runs
        avg_duration = await conn.fetchval("""
            SELECT AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000) 
            FROM workflow_runs 
            WHERE tenant_id = $1 AND status = 'success' AND completed_at IS NOT NULL
        """, tenant_id)
        
        return {
            "totalRuns": total_runs,
            "successRate": success_runs / total_runs,
            "avgDurationMs": float(avg_duration or 0)
        }
