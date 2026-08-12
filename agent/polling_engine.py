import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Any, List

from db_workflows import get_db_pool
from execution_engine import execute_workflow
from tool_gateway.centralized_gateway import execute_mcp_tool
from services.llm_gateway import get_llm

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

async def _poll_app_integration(workflow_id: str, node: Dict[str, Any], tenant_id: str, user_id: str, app_name: str):
    """Generic polling function for any app integration."""
    integration_name = app_name.capitalize()
    state = await _get_polling_state(workflow_id, integration_name)
    processed_ids = set(state['last_processed_ids'])
    
    # Extract arguments from node data for the search/list action
    data = node.get('data', {})
    
    # Map the UI fields directly to arguments for the adapter
    arguments = {"action": "search"}
    if app_name == 'airtable':
        arguments["base_id"] = data.get("baseId")
        arguments["table_name"] = data.get("tableName", "Orders")
        arguments["query"] = data.get("query")
    elif app_name == 'gmail':
        arguments["q"] = data.get("query")
    elif app_name in ['sheets', 'google sheets']:
        arguments["spreadsheet_id"] = data.get("spreadsheetId")
        arguments["range"] = data.get("range")
    else:
        # Pass all data for generic integrations
        arguments.update(data)
    
    print(f"[POLLING] Checking {integration_name} for workflow {workflow_id}...")
    
    try:
        # 1. Execute the tool to get the latest records
        response_str = await execute_mcp_tool(
            tenant_id=tenant_id,
            agent_instance_id="workflow-builder", # Dummy for workflow orchestration
            tool_name=app_name,
            arguments=arguments
        )
        
        if response_str.startswith("Security Error") or "Error" in response_str:
            print(f"[POLLING] Adapter error: {response_str}")
            return
            
        # 2. Use LLM to extract new events
        llm = get_llm()
        prompt = f"""
You are an AI polling assistant. 
Your task is to analyze the text output from a tool and extract a list of NEW events/records that have not been processed yet.

Tool Output:
{response_str}

Previously Processed IDs (ignore these):
{list(processed_ids)}

Instructions:
1. Extract all discrete items (records, emails, rows, etc.) that match the intent of the trigger.
2. Determine a state-aware unique ID for each item. To ensure that updates to existing records trigger the workflow, the unique ID MUST be a combination of the item's primary ID and its current state or hash (e.g. `rec123_status_delivered`, `msg123_unread`, or `row5_hash`).
3. Exclude any item whose state-aware unique ID is in the 'Previously Processed IDs' list.
4. Return ONLY a valid JSON array of objects. Each object must have:
   - "id": a string representing the state-aware unique ID.
   - "data": a dictionary containing the extracted fields of the item.

If there are no new items, return an empty array `[]`. Do not include markdown formatting or backticks around the JSON.
"""
        llm_response = await llm.ainvoke(prompt)
        content = llm_response.content.strip()
        if content.startswith("```json"):
            content = content[7:-3].strip()
        elif content.startswith("```"):
            content = content[3:-3].strip()
            
        try:
            new_events = json.loads(content)
        except json.JSONDecodeError:
            print(f"[POLLING] Failed to parse LLM response as JSON: {content}")
            return
            
        if not new_events:
            print(f"[POLLING] No new events found for {integration_name}.")
            return
            
        print(f"[POLLING] Found {len(new_events)} new events. Triggering workflow...")
        
        # 3. Trigger workflow and update state
        new_processed_ids = list(processed_ids)
        for event in new_events:
            event_id = str(event.get("id"))
            event_data = event.get("data", {})
            
            try:
                await execute_workflow(workflow_id, "app_event", event_data, user_id)
                new_processed_ids.append(event_id)
            except Exception as w_err:
                print(f"[POLLING] Error executing workflow for event {event_id}: {w_err}")
                
        await _save_polling_state(workflow_id, integration_name, new_processed_ids)

    except Exception as e:
        print(f"[POLLING] Error polling {integration_name}: {e}")

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
                if isinstance(nodes, dict):
                    nodes = list(nodes.values())
                    
                trigger_nodes = [n for n in nodes if n.get('type') == 'TRIGGER']
                
                for node in trigger_nodes:
                    trigger_mode = node.get('data', {}).get('triggerMode')
                    if trigger_mode == 'app_event':
                        app_name = node.get('data', {}).get('appIntegration', '').lower()
                        
                        # In a real environment, we'd look up the user who created this workflow
                        user_id = "11111111-1111-1111-1111-111111111111"
                        
                        if app_name:
                            await _poll_app_integration(workflow_id, node, tenant_id, user_id, app_name)
                            
    except Exception as e:
        print(f"[POLLING] Engine error: {e}")

async def start_polling_engine():
    """Start the infinite polling loop."""
    print(f"[POLLING] Engine started. Polling every {POLLING_INTERVAL_SECONDS} seconds.")
    while True:
        await poll_active_workflows()
        await asyncio.sleep(POLLING_INTERVAL_SECONDS)
