from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import uuid
import json

from models import WorkflowDefinition, WorkflowExecutionState
from execution_engine import execute_workflow, resume_workflow_after_approval
from db_workflows import (
    list_workflows,
    create_workflow,
    update_workflow,
    load_workflow,
    get_workflow_runs,
    get_run_steps,
    get_analytics
)

router = APIRouter()

# DUMMY TENANT ID for demo/FYP purposes
# In production, this would be extracted from the user's JWT token
TENANT_ID = "00000000-0000-0000-0000-000000000000"
USER_ID = "11111111-1111-1111-1111-111111111111"

class WorkflowCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    definition: Dict[str, Any]

class WorkflowUpdateRequest(BaseModel):
    definition: Dict[str, Any]
    status: Optional[str] = None

class TriggerRequest(BaseModel):
    context: Dict[str, Any] = {}

class ApprovalDecisionRequest(BaseModel):
    approved: bool
    comment: Optional[str] = None

@router.get("/")
async def get_workflows(status: Optional[str] = None):
    """List workflows for the tenant."""
    return await list_workflows(TENANT_ID, status)

@router.post("/")
async def create_new_workflow(req: WorkflowCreateRequest):
    """Create a new workflow."""
    # Ensure it's valid
    try:
        WorkflowDefinition(**req.definition)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    wf_id = await create_workflow(TENANT_ID, req.name, req.description or "", req.definition, USER_ID)
    return {"workflow_id": wf_id, "status": "draft"}

@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str):
    """Fetch full workflow definition."""
    try:
        wf = await load_workflow(workflow_id)
        # Note: We need to also return metadata (name, status) but load_workflow returns just definition
        # For a complete API, we'd query the row fully. Returning definition for now.
        return {"workflow_id": workflow_id, "definition": wf.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.put("/{workflow_id}")
async def update_existing_workflow(workflow_id: str, req: WorkflowUpdateRequest):
    """Update workflow definition."""
    try:
        WorkflowDefinition(**req.definition)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    await update_workflow(workflow_id, req.definition, req.status)
    return {"workflow_id": workflow_id, "updated": True}

@router.post("/{workflow_id}/trigger")
async def trigger_workflow(workflow_id: str, req: TriggerRequest):
    """Manually execute the workflow."""
    try:
        run_id = await execute_workflow(workflow_id, "MANUAL", req.context, USER_ID)
        return {"run_id": run_id, "status": "started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{workflow_id}/dry-run")
async def dry_run_workflow(workflow_id: str, req: TriggerRequest):
    """Execute the workflow in memory without committing actions or saving state."""
    # This is a stub for the real dry-run execution engine integration
    return {"status": "success", "message": "Dry-run completed successfully", "run_id": "dry-run-" + str(uuid.uuid4())}

@router.post("/{workflow_id}/webhook")
async def trigger_webhook(workflow_id: str, request: Request):
    """Execute the workflow via webhook."""
    body = await request.json()
    try:
        run_id = await execute_workflow(workflow_id, "WEBHOOK", body, USER_ID)
        return {"run_id": run_id, "status": "started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{workflow_id}/runs")
async def get_runs(workflow_id: str):
    """List all runs of a workflow."""
    return await get_workflow_runs(workflow_id)

@router.get("/{workflow_id}/runs/{run_id}/steps")
async def get_steps(workflow_id: str, run_id: str):
    """Get step-by-step trace of execution."""
    steps = await get_run_steps(run_id)
    return {"steps": steps}

@router.post("/approvals/{approval_id}/decision")
async def handle_approval(approval_id: str, req: ApprovalDecisionRequest):
    """Human approves or rejects an approval request."""
    # In a real app we'd verify the user role, fetch approval, then route
    run_id = await resume_workflow_after_approval(approval_id, req.approved)
    return {"status": "resumed", "run_id": run_id}

@router.get("/analytics/dashboard")
async def get_dashboard_analytics():
    """Get analytics for the tenant workflows."""
    return await get_analytics(TENANT_ID)

@router.get("/mcp/tools")
async def get_mcp_tools():
    """Discover available MCP tools (for the canvas inspector)."""
    # Exposing hardcoded mock for Deliverable 5 UI discovery for now
    # Since the real tools require specific agent bindings in the current system
    return [
        {
            "mcp": "Stripe",
            "tool_name": "create_charge",
            "description": "Create a payment charge",
            "parameters": [
                { "name": "amount", "type": "number", "required": True, "description": "Amount in cents" },
                { "name": "currency", "type": "string", "required": False, "description": "usd, eur, etc" }
            ]
        },
        {
            "mcp": "Gmail",
            "tool_name": "send_email",
            "description": "Send an email",
            "parameters": [
                { "name": "to", "type": "string", "required": True },
                { "name": "subject", "type": "string", "required": True },
                { "name": "body", "type": "string", "required": True }
            ]
        },
        {
            "mcp": "Airtable",
            "tool_name": "create_record",
            "description": "Create a new record in Airtable",
            "parameters": [
                { "name": "tableId", "type": "string", "required": True },
                { "name": "fields", "type": "object", "required": True }
            ]
        }
    ]
