"""
ClickUp Adapter — translates task management tool requests to ClickUp REST API v2 using OAuth2 tokens.
"""
from typing import Dict, Any
import httpx


async def execute_clickup_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    token = credentials.get("access_token") or credentials.get("api_key") or credentials.get("bearer_token")
    if not token:
        return "Error: ClickUp Access Token is missing from tenant credentials."

    headers = {
        "Authorization": token,
        "Content-Type": "application/json",
    }

    action = arguments.get("action") or tool_name

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if action in ("clickup_get_tasks", "get_tasks", "list_tasks"):
                list_id = arguments.get("list_id")
                if not list_id:
                    return "Error: 'list_id' is required to fetch ClickUp tasks."
                
                url = f"https://api.clickup.com/api/v2/list/{list_id}/task"
                params = {"archived": "false"}
                if arguments.get("status"):
                    params["statuses[]"] = arguments.get("status")
                
                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    tasks = res.json().get("tasks", [])
                    return f"Successfully retrieved {len(tasks)} ClickUp task(s) from list {list_id}: {tasks[:5]}"
                return f"ClickUp Fetch Tasks Error ({res.status_code}): {res.text}"

            elif action in ("clickup_create_task", "create_task"):
                list_id = arguments.get("list_id")
                name = arguments.get("name")
                if not list_id or not name:
                    return "Error: 'list_id' and 'name' are required to create a ClickUp task."
                
                url = f"https://api.clickup.com/api/v2/list/{list_id}/task"
                payload = {
                    "name": name,
                    "description": arguments.get("description", ""),
                    "status": arguments.get("status", "to do"),
                }
                if arguments.get("assignees"):
                    payload["assignees"] = arguments.get("assignees")

                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    created_task = res.json()
                    return f"ClickUp task created successfully! Task ID: {created_task.get('id')}, Name: '{name}'"
                return f"ClickUp Create Task Error ({res.status_code}): {res.text}"

            elif action in ("clickup_update_task", "update_task"):
                task_id = arguments.get("task_id")
                if not task_id:
                    return "Error: 'task_id' is required to update a ClickUp task."
                
                url = f"https://api.clickup.com/api/v2/task/{task_id}"
                payload = {}
                if arguments.get("name"):
                    payload["name"] = arguments.get("name")
                if arguments.get("description"):
                    payload["description"] = arguments.get("description")
                if arguments.get("status"):
                    payload["status"] = arguments.get("status")

                res = await client.put(url, headers=headers, json=payload)
                if res.is_success:
                    return f"ClickUp task '{task_id}' updated successfully!"
                return f"ClickUp Update Task Error ({res.status_code}): {res.text}"

            else:
                return f"Error: Unknown or unsupported ClickUp action '{action}'."
    except Exception as e:
        return f"ClickUp execution exception: {str(e)}"
