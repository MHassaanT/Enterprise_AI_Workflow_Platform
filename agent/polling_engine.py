import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Any, List

from db_workflows import get_db_pool
from execution_engine import execute_workflow
from tool_gateway.adapters.airtable_adapter import execute_airtable_tool
# Assuming we have generic adapters for other tools as well
# For Gmail and Sheets we will simulate or use existing gateway if available

POLLING_INTERVAL_SECONDS = 60  # Default to 1 minute for demonstration

async def _get_polling_state(workflow_id: str, integration_name: str) -> Dict[str, Any]:
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        record = await conn.fetchrow(
            """
            SELECT last_processed_ids, last_checked_timestamp 
            FROM workflow_polling_state 
            WHERE workflow_id = $1 AND integration_name = $2
            """,
            workflow_id, integration_name
        )
        if record:
            return {
                "last_processed_ids": json.loads(record['last_processed_ids']),
                "last_checked_timestamp": record['last_checked_timestamp']
            }
        return {"last_processed_ids": [], "last_checked_timestamp": None}

async def _save_polling_state(workflow_id: str, integration_name: str, processed_ids: List[str]):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO workflow_polling_state (workflow_id, integration_name, last_processed_ids, last_checked_timestamp)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
            ON CONFLICT (workflow_id, integration_name) 
            DO UPDATE SET 
                last_processed_ids = EXCLUDED.last_processed_ids,
                last_checked_timestamp = CURRENT_TIMESTAMP
            """,
            workflow_id, integration_name, json.dumps(processed_ids)
        )

async def _poll_airtable(workflow_id: str, node: Dict[str, Any], tenant_id: str, user_id: str):
    """Poll Airtable for new records."""
    integration_name = "Airtable"
    state = await _get_polling_state(workflow_id, integration_name)
    processed_ids = set(state['last_processed_ids'])
    
    # Extract arguments from node data
    data = node.get('data', {})
    arguments = {
        "base_id": data.get("baseId"),
        "table_name": data.get("tableName", "Orders"),
        "query": data.get("query", "Delivered")
    }
    
    # Note: In a real system, credentials would be fetched based on tenant_id
    credentials = {"access_token": "dummy_token"} # We mock credentials for polling demonstration
    
    print(f"[POLLING] Checking Airtable for workflow {workflow_id}...")
    
    try:
        # We reuse the Airtable adapter. A real system might have a dedicated list_records function.
        # execute_airtable_tool handles the search and returns a formatted string.
        # For true integration, the adapter should return structured JSON.
        # Here we simulate finding a new record if the logic requires it.
        # We will just print the intent for the mock/demo environment.
        pass 
    except Exception as e:
        print(f"[POLLING] Error polling Airtable: {e}")

async def _poll_gmail(workflow_id: str, node: Dict[str, Any], tenant_id: str, user_id: str):
    """Poll Gmail for new emails."""
    integration_name = "Gmail"
    print(f"[POLLING] Checking Gmail for workflow {workflow_id}...")
    # Add real integration logic using Google APIs here

async def _poll_sheets(workflow_id: str, node: Dict[str, Any], tenant_id: str, user_id: str):
    """Poll Google Sheets for new rows."""
    integration_name = "Google Sheets"
    print(f"[POLLING] Checking Google Sheets for workflow {workflow_id}...")
    # Add real integration logic using Google APIs here

async def poll_active_workflows():
    """Main loop iteration to poll all active workflows with app event triggers."""
    try:
        pool = await get_db_pool()
        async with pool.acquire() as conn:
            # Fetch active workflows
            workflows = await conn.fetch("SELECT workflow_id, definition, tenant_id FROM workflows WHERE status = 'published' OR status = 'active'")
            
            for wf in workflows:
                workflow_id = str(wf['workflow_id'])
                tenant_id = str(wf['tenant_id'])
                definition = json.loads(wf['definition'])
                
                # Find Trigger Node
                nodes = definition.get('nodes', [])
                trigger_nodes = [n for n in nodes if n.get('type') == 'TRIGGER']
                
                for node in trigger_nodes:
                    trigger_mode = node.get('data', {}).get('triggerMode')
                    if trigger_mode == 'app_event':
                        app_name = node.get('data', {}).get('appIntegration', '').lower()
                        
                        # In a real environment, we'd look up the user who created this workflow
                        user_id = "11111111-1111-1111-1111-111111111111"
                        
                        if app_name == 'airtable':
                            await _poll_airtable(workflow_id, node, tenant_id, user_id)
                        elif app_name == 'gmail':
                            await _poll_gmail(workflow_id, node, tenant_id, user_id)
                        elif app_name in ['sheets', 'google sheets']:
                            await _poll_sheets(workflow_id, node, tenant_id, user_id)
                            
    except Exception as e:
        print(f"[POLLING] Engine error: {e}")

async def start_polling_engine():
    """Start the infinite polling loop."""
    print(f"[POLLING] Engine started. Polling every {POLLING_INTERVAL_SECONDS} seconds.")
    while True:
        await poll_active_workflows()
        await asyncio.sleep(POLLING_INTERVAL_SECONDS)
