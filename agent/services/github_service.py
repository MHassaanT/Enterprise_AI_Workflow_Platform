"""
GitHub API Service Module

Provides helper functions to interact with the GitHub REST API (v3) using `httpx`.
Supports operations needed by the Coding Agent:
- Listing repos
- Fetching file trees & file contents
- Creating feature branches
- Committing file changes
- Opening Pull Requests
"""

import os
import base64
import httpx
from typing import Dict, Any, List, Optional

GITHUB_API_BASE = "https://api.github.com"

def get_headers(token: Optional[str] = None) -> Dict[str, str]:
    auth_token = token or os.getenv("GITHUB_TOKEN", "")
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Enterprise-AI-Coding-Agent",
    }
    if auth_token:
        headers["Authorization"] = f"token {auth_token}"
    return headers

async def list_repositories(token: Optional[str] = None) -> List[Dict[str, Any]]:
    headers = get_headers(token)
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Try fetching authenticated user repos first
        if "Authorization" in headers:
            resp = await client.get(f"{GITHUB_API_BASE}/user/repos?per_page=100&sort=updated", headers=headers)
            if resp.status_code == 200:
                return [
                    {
                        "full_name": repo["full_name"],
                        "name": repo["name"],
                        "owner": repo["owner"]["login"],
                        "default_branch": repo.get("default_branch", "main"),
                        "private": repo.get("private", False),
                        "description": repo.get("description", ""),
                    }
                    for repo in resp.json()
                ]
        
        # Fallback to popular or configured repos if unauthenticated
        default_repo = os.getenv("GITHUB_DEFAULT_REPO", "octocat/Hello-World")
        return [
            {
                "full_name": default_repo,
                "name": default_repo.split("/")[-1],
                "owner": default_repo.split("/")[0],
                "default_branch": "main",
                "private": False,
                "description": "Default configured repository",
            }
        ]

async def get_repo_branches(owner: str, repo: str, token: Optional[str] = None) -> List[str]:
    headers = get_headers(token)
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}/branches", headers=headers)
        if resp.status_code == 200:
            return [b["name"] for b in resp.json()]
        return ["main"]

async def get_repo_tree(owner: str, repo: str, branch: str = "main", token: Optional[str] = None) -> Dict[str, Any]:
    headers = get_headers(token)
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Get tree sha for branch
        tree_resp = await client.get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1", headers=headers)
        if tree_resp.status_code == 200:
            tree_data = tree_resp.json()
            return {
                "truncated": tree_data.get("truncated", False),
                "tree": [
                    {
                        "path": item["path"],
                        "type": "dir" if item["type"] == "tree" else "file",
                        "size": item.get("size", 0),
                        "sha": item.get("sha", "")
                    }
                    for item in tree_data.get("tree", [])
                ]
            }
        # Fallback using contents endpoint
        contents_resp = await client.get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents?ref={branch}", headers=headers)
        if contents_resp.status_code == 200:
            return {
                "truncated": False,
                "tree": [
                    {
                        "path": item["path"],
                        "type": "dir" if item["type"] == "dir" else "file",
                        "size": item.get("size", 0),
                        "sha": item.get("sha", "")
                    }
                    for item in contents_resp.json()
                ]
            }
        return {"truncated": False, "tree": [], "error": f"Failed to fetch repository tree (HTTP {tree_resp.status_code})"}

async def get_file_content(owner: str, repo: str, path: str, branch: str = "main", token: Optional[str] = None) -> Dict[str, Any]:
    headers = get_headers(token)
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}?ref={branch}", headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            raw_content = ""
            if "content" in data and data.get("encoding") == "base64":
                raw_content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
            elif "content" in data:
                raw_content = data["content"]
            
            return {
                "path": data.get("path", path),
                "sha": data.get("sha", ""),
                "size": data.get("size", 0),
                "content": raw_content,
                "encoding": "utf-8"
            }
        return {"error": f"Could not fetch file '{path}' (HTTP {resp.status_code})"}

async def create_branch(owner: str, repo: str, base_branch: str, new_branch: str, token: Optional[str] = None) -> Dict[str, Any]:
    headers = get_headers(token)
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Get base branch ref commit SHA
        ref_resp = await client.get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/ref/heads/{base_branch}", headers=headers)
        if ref_resp.status_code != 200:
            return {"success": False, "error": f"Base branch '{base_branch}' not found (HTTP {ref_resp.status_code})"}
        
        base_sha = ref_resp.json()["object"]["sha"]

        # Create new ref
        create_resp = await client.post(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/refs",
            headers=headers,
            json={
                "ref": f"refs/heads/{new_branch}",
                "sha": base_sha
            }
        )
        if create_resp.status_code in (201, 422): # 422 if branch already exists
            return {
                "success": True,
                "branch": new_branch,
                "base_branch": base_branch,
                "sha": base_sha,
                "already_existed": create_resp.status_code == 422
            }
        return {"success": False, "error": f"Failed to create branch '{new_branch}': {create_resp.text}"}

async def commit_file_change(
    owner: str,
    repo: str,
    path: str,
    content: str,
    branch: str,
    commit_message: str,
    token: Optional[str] = None
) -> Dict[str, Any]:
    headers = get_headers(token)
    async with httpx.AsyncClient(timeout=15.0) as client:
        # Check if file exists to get sha for update
        existing_sha = None
        check_resp = await client.get(f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}?ref={branch}", headers=headers)
        if check_resp.status_code == 200:
            existing_sha = check_resp.json().get("sha")

        encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")

        payload = {
            "message": commit_message,
            "content": encoded_content,
            "branch": branch
        }
        if existing_sha:
            payload["sha"] = existing_sha

        put_resp = await client.put(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}",
            headers=headers,
            json=payload
        )
        if put_resp.status_code in (200, 201):
            res_data = put_resp.json()
            return {
                "success": True,
                "path": path,
                "branch": branch,
                "commit_sha": res_data.get("commit", {}).get("sha", ""),
                "html_url": res_data.get("content", {}).get("html_url", "")
            }
        return {"success": False, "error": f"Failed to commit file change to '{path}': {put_resp.text}"}

async def create_pull_request(
    owner: str,
    repo: str,
    title: str,
    body: str,
    head_branch: str,
    base_branch: str = "main",
    token: Optional[str] = None
) -> Dict[str, Any]:
    headers = get_headers(token)
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls",
            headers=headers,
            json={
                "title": title,
                "body": body,
                "head": head_branch,
                "base": base_branch
            }
        )
        if resp.status_code == 201:
            pr_data = resp.json()
            return {
                "success": True,
                "pr_number": pr_data["number"],
                "html_url": pr_data["html_url"],
                "title": pr_data["title"],
                "state": pr_data["state"]
            }
        elif resp.status_code == 422: # PR might already exist
            # Fetch existing PRs
            list_prs = await client.get(
                f"{GITHUB_API_BASE}/repos/{owner}/{repo}/pulls?head={owner}:{head_branch}&base={base_branch}",
                headers=headers
            )
            if list_prs.status_code == 200 and len(list_prs.json()) > 0:
                pr_data = list_prs.json()[0]
                return {
                    "success": True,
                    "pr_number": pr_data["number"],
                    "html_url": pr_data["html_url"],
                    "title": pr_data["title"],
                    "state": pr_data["state"],
                    "already_existed": True
                }
        return {"success": False, "error": f"Failed to create pull request: {resp.text}"}
