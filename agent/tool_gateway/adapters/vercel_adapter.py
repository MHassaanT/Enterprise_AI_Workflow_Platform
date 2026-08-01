"""
Vercel Adapter — translates tool requests to Vercel REST API.
Injects decrypted OAuth2 access token as Bearer token into HTTP requests.
"""
from typing import Dict, Any
import httpx


async def execute_vercel_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    """
    Executes Vercel API calls (deployments, project deployment statuses) using tenant access token.
    """
    token = credentials.get("access_token") or credentials.get("bearer_token") or credentials.get("api_key")
    if not token:
        return "Error: Vercel access token is missing from tenant credentials. Please connect Vercel via OAuth2."

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    team_id = credentials.get("team_id") or arguments.get("team_id")
    action = arguments.get("action") or tool_name
    action_lower = action.lower()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            params = {}
            if team_id:
                params["teamId"] = team_id

            # 1. List Deployments
            if "deployment" in action_lower or "list" in action_lower:
                project_id = arguments.get("project_id") or arguments.get("project")
                if project_id:
                    params["projectId"] = project_id
                
                params["limit"] = arguments.get("limit", 10)
                url = "https://api.vercel.com/v6/deployments"

                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    deployments = res.json().get("deployments", [])
                    formatted = [
                        {
                            "id": d.get("uid"),
                            "name": d.get("name"),
                            "state": d.get("state"),
                            "url": f"https://{d.get('url')}" if d.get("url") else None,
                            "created": d.get("created"),
                            "target": d.get("target"),
                        }
                        for d in deployments[:10]
                    ]
                    return f"Fetched {len(formatted)} Vercel deployment(s): {formatted}"
                return f"Vercel API Error ({res.status_code}): {res.text}"

            # 2. Check Specific Deployment or Project Status
            elif "status" in action_lower or "project" in action_lower or "get_deployment_status" in action_lower:
                deployment_id = arguments.get("deployment_id") or arguments.get("id")
                project_id = arguments.get("project_id") or arguments.get("project_name")

                if deployment_id:
                    url = f"https://api.vercel.com/v13/deployments/{deployment_id}"
                    res = await client.get(url, headers=headers, params=params)
                    if res.is_success:
                        d = res.json()
                        return f"Vercel Deployment Status for '{deployment_id}': State={d.get('status') or d.get('state')}, URL=https://{d.get('url')}"
                    return f"Vercel API Error ({res.status_code}): {res.text}"

                elif project_id:
                    url = f"https://api.vercel.com/v9/projects/{project_id}"
                    res = await client.get(url, headers=headers, params=params)
                    if res.is_success:
                        p = res.json()
                        return f"Vercel Project Details for '{project_id}': ID={p.get('id')}, Name={p.get('name')}, Framework={p.get('framework')}"
                    return f"Vercel API Error ({res.status_code}): {res.text}"

                else:
                    return "Error: Either 'deployment_id' or 'project_id' is required to check status."

            # Fallback
            else:
                url = "https://api.vercel.com/v9/projects"
                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    projects = res.json().get("projects", [])
                    return f"Vercel Projects ({len(projects)}): {[p.get('name') for p in projects[:5]]}"
                return f"Vercel API Response ({res.status_code}): {res.text}"

    except Exception as e:
        return f"Vercel execution exception: {str(e)}"
