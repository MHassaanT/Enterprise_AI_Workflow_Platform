"""
GitHub Adapter — translates tool requests to GitHub REST API.
Injects decrypted OAuth2 access token as Bearer token into HTTP headers.
"""
from typing import Dict, Any
import httpx


async def execute_github_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    """
    Executes GitHub API calls (issues, PRs, workflow dispatches) using tenant OAuth access token.
    """
    token = credentials.get("access_token") or credentials.get("bearer_token") or credentials.get("api_key")
    if not token:
        return "Error: GitHub access token is missing from tenant credentials. Please connect GitHub via OAuth2."

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Enterprise-AI-Platform",
    }

    action = arguments.get("action") or tool_name
    action_lower = action.lower()

    owner = arguments.get("owner")
    repo = arguments.get("repo")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Fetch Repository Issues
            if "issue" in action_lower or "get_issues" in action_lower:
                if not owner or not repo:
                    return "Error: Both 'owner' and 'repo' are required to fetch GitHub issues."

                state = arguments.get("state", "open")
                url = f"https://api.github.com/repos/{owner}/{repo}/issues"
                params = {"state": state, "per_page": arguments.get("limit", 10)}

                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    issues = res.json()
                    formatted = [
                        {
                            "number": i.get("number"),
                            "title": i.get("title"),
                            "state": i.get("state"),
                            "user": i.get("user", {}).get("login"),
                            "created_at": i.get("created_at"),
                            "html_url": i.get("html_url"),
                        }
                        for i in issues[:10]
                    ]
                    return f"Fetched {len(formatted)} GitHub issue(s) for '{owner}/{repo}': {formatted}"
                return f"GitHub API Error ({res.status_code}): {res.text}"

            # 2. Check Pull Request Statuses
            elif "pull" in action_lower or "pr" in action_lower or "get_pull_requests" in action_lower:
                if not owner or not repo:
                    return "Error: Both 'owner' and 'repo' are required to fetch GitHub pull requests."

                state = arguments.get("state", "open")
                url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
                params = {"state": state, "per_page": arguments.get("limit", 10)}

                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    prs = res.json()
                    formatted = [
                        {
                            "number": p.get("number"),
                            "title": p.get("title"),
                            "state": p.get("state"),
                            "draft": p.get("draft"),
                            "head": p.get("head", {}).get("ref"),
                            "base": p.get("base", {}).get("ref"),
                            "html_url": p.get("html_url"),
                        }
                        for p in prs[:10]
                    ]
                    return f"Fetched {len(formatted)} GitHub pull request(s) for '{owner}/{repo}': {formatted}"
                return f"GitHub API Error ({res.status_code}): {res.text}"

            # 3. Trigger Workflow Dispatch
            elif "workflow" in action_lower or "trigger_workflow" in action_lower or "dispatch" in action_lower:
                workflow_id = arguments.get("workflow_id") or arguments.get("workflow_file")
                ref = arguments.get("ref") or "main"

                if not owner or not repo or not workflow_id:
                    return "Error: 'owner', 'repo', and 'workflow_id' are required to trigger a workflow dispatch."

                url = f"https://api.github.com/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches"
                payload = {
                    "ref": ref,
                    "inputs": arguments.get("inputs", {}),
                }

                res = await client.post(url, headers=headers, json=payload)
                if res.status_code in (204, 201, 200):
                    return f"Successfully triggered GitHub workflow dispatch for '{workflow_id}' on ref '{ref}' in repo '{owner}/{repo}'."
                return f"GitHub Workflow Dispatch Error ({res.status_code}): {res.text}"

            # 4. Create Branch
            elif "branch" in action_lower or "create_branch" in action_lower:
                new_branch = arguments.get("branch_name") or arguments.get("branch") or arguments.get("new_branch")
                base_branch = arguments.get("base_branch") or arguments.get("base") or "main"

                if not owner or not repo or not new_branch:
                    return "Error: 'owner', 'repo', and 'branch_name' (or 'new_branch') are required to create a new branch."

                from services.github_service import create_branch
                res_dict = await create_branch(owner=owner, repo=repo, base_branch=base_branch, new_branch=new_branch, token=token)
                if res_dict.get("success"):
                    if res_dict.get("already_existed"):
                        return f"Branch '{new_branch}' already exists in repo '{owner}/{repo}' (based on '{base_branch}')."
                    return f"Successfully created branch '{new_branch}' in repo '{owner}/{repo}' based on '{base_branch}'."
                return f"GitHub Create Branch Error: {res_dict.get('error')}"

            # Fallback
            else:
                if owner and repo:
                    url = f"https://api.github.com/repos/{owner}/{repo}"
                    res = await client.get(url, headers=headers)
                    if res.is_success:
                        return f"GitHub Repository Info for '{owner}/{repo}': {res.json()}"
                return f"Error: Unsupported GitHub action '{action}'."

    except Exception as e:
        return f"GitHub execution exception: {str(e)}"
