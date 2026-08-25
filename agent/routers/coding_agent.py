"""
Coding Agent Router

FastAPI endpoints for the Coding Agent domain:
- List GitHub repositories
- Get repo file tree
- Read file content
- Create branch
- Create PR
- Run LangGraph Coding Agent chat flow
"""

from fastapi import APIRouter, HTTPException, Query, Header
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from services import github_service
from graph.coding.graph import coding_agent_graph

router = APIRouter()

class ChatRequest(BaseModel):
    prompt: str
    repo: str = "octocat/Hello-World"
    base_branch: str = "main"
    working_branch: Optional[str] = None
    plan_mode: bool = False
    thread_id: Optional[str] = "default-thread"

class BranchRequest(BaseModel):
    repo: str
    base_branch: str = "main"
    new_branch: str

class PRRequest(BaseModel):
    repo: str
    title: str
    body: str
    head_branch: str
    base_branch: str = "main"

@router.get("/repos")
async def get_repositories(authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization and authorization.startswith("Bearer ") else None
    try:
        repos = await github_service.list_repositories(token)
        return {"status": "success", "repositories": repos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tree")
async def get_tree(
    repo: str = Query(..., description="Repository full name, e.g. owner/repo"),
    branch: str = Query("main", description="Branch name"),
    authorization: Optional[str] = Header(None)
):
    token = authorization.replace("Bearer ", "") if authorization and authorization.startswith("Bearer ") else None
    try:
        owner, repo_name = repo.split("/") if "/" in repo else ("octocat", repo)
        tree = await github_service.get_repo_tree(owner, repo_name, branch=branch, token=token)
        return {"status": "success", "data": tree}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/file")
async def get_file(
    repo: str = Query(..., description="Repository full name"),
    path: str = Query(..., description="File path in repo"),
    branch: str = Query("main", description="Branch name"),
    authorization: Optional[str] = Header(None)
):
    token = authorization.replace("Bearer ", "") if authorization and authorization.startswith("Bearer ") else None
    try:
        owner, repo_name = repo.split("/") if "/" in repo else ("octocat", repo)
        content = await github_service.get_file_content(owner, repo_name, path=path, branch=branch, token=token)
        return {"status": "success", "data": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create-branch")
async def create_branch_endpoint(req: BranchRequest, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization and authorization.startswith("Bearer ") else None
    try:
        owner, repo_name = req.repo.split("/") if "/" in req.repo else ("octocat", req.repo)
        res = await github_service.create_branch(owner, repo_name, req.base_branch, req.new_branch, token=token)
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error"))
        return {"status": "success", "data": res}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create-pr")
async def create_pr_endpoint(req: PRRequest, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization and authorization.startswith("Bearer ") else None
    try:
        owner, repo_name = req.repo.split("/") if "/" in req.repo else ("octocat", req.repo)
        res = await github_service.create_pull_request(
            owner, repo_name, req.title, req.body, req.head_branch, req.base_branch, token=token
        )
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error"))
        return {"status": "success", "data": res}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def chat_endpoint(req: ChatRequest, authorization: Optional[str] = Header(None)):
    token = authorization.replace("Bearer ", "") if authorization and authorization.startswith("Bearer ") else None
    try:
        config = {"configurable": {"thread_id": req.thread_id or "coding-session"}}
        initial_state = {
            "messages": [{"role": "user", "content": req.prompt}],
            "repo": req.repo,
            "base_branch": req.base_branch,
            "working_branch": req.working_branch or "",
            "plan_mode": req.plan_mode,
            "status": "idle",
            "github_token": token
        }

        result = await coding_agent_graph.ainvoke(initial_state, config=config)

        # Format clean response for client
        assistant_messages = [
            m.get("content") if isinstance(m, dict) else m.content
            for m in result.get("messages", [])
            if (isinstance(m, dict) and m.get("role") == "assistant") or getattr(m, "type", None) == "ai"
        ]
        
        last_message = assistant_messages[-1] if assistant_messages else "Task completed."

        return {
            "status": "success",
            "message": last_message,
            "plan": result.get("plan"),
            "working_branch": result.get("working_branch"),
            "modified_files": result.get("modified_files", []),
            "pr_info": result.get("pr_info"),
            "agent_status": result.get("status")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
