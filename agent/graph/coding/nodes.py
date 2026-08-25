"""
Coding Agent LangGraph Nodes

Defines the execution nodes for the Coding Agent pipeline:
1. planner_node: Generates structured task execution plan when plan_mode is active.
2. branch_node: Ensures feature branch exists in GitHub repo.
3. code_editor_node: Fetches target files, generates code edits using LLM, and commits to branch.
4. pr_creator_node: Automatically opens Pull Request on GitHub.
"""

import json
import time
import re
from typing import Dict, Any, List
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from graph.coding.state import CodingAgentState
from services.llm_gateway import get_llm
from services import github_service

def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')[:30]

async def planner_node(state: CodingAgentState) -> Dict[str, Any]:
    """Generates a structured execution plan for code modifications."""
    repo = state.get("repo", "octocat/Hello-World")
    messages = state.get("messages", [])
    user_prompt = ""
    for msg in reversed(messages):
        if msg.get("role") == "user" or isinstance(msg, HumanMessage):
            user_prompt = msg.get("content") if isinstance(msg, dict) else msg.content
            break

    if not user_prompt:
        user_prompt = "Refactor and optimize code base."

    # Fetch file tree for context if available
    owner, repo_name = repo.split("/") if "/" in repo else ("octocat", repo)
    token = state.get("github_token")
    base_branch = state.get("base_branch", "main")

    tree_info = await github_service.get_repo_tree(owner, repo_name, branch=base_branch, token=token)
    tree_paths = [item["path"] for item in tree_info.get("tree", []) if item["type"] == "file"][:40]

    sys_prompt = (
        "You are an expert Senior Software Engineer AI Agent. "
        "Analyze the user's task and the repository structure, then produce a JSON execution plan.\n"
        "Output ONLY valid JSON with no markdown block or backticks in this exact schema:\n"
        "{\n"
        '  "summary": "Brief 1-2 sentence plan summary",\n'
        '  "target_files": ["file1.js", "file2.py"],\n'
        '  "steps": [\n'
        '    {"id": 1, "task": "Task title", "description": "Details", "status": "pending"}\n'
        '  ],\n'
        '  "estimated_changes": "Description of edits"\n'
        "}"
    )

    user_msg = (
        f"Repository: {repo}\n"
        f"Base Branch: {base_branch}\n"
        f"Repository Files Context:\n{json.dumps(tree_paths, indent=2)}\n\n"
        f"User Instruction:\n{user_prompt}"
    )

    llm = get_llm()
    response = await llm.ainvoke([SystemMessage(content=sys_prompt), HumanMessage(content=user_msg)])
    
    plan_content = response.content.strip()
    # Clean potential markdown wrapping
    if plan_content.startswith("```"):
        plan_content = re.sub(r"^```[a-z]*\n?", "", plan_content)
        plan_content = re.sub(r"\n?```$", "", plan_content).strip()

    try:
        plan_json = json.loads(plan_content)
    except Exception:
        plan_json = {
            "summary": f"Plan for: {user_prompt[:60]}",
            "target_files": tree_paths[:2],
            "steps": [
                {"id": 1, "task": "Analyze codebase", "description": "Identify target files to edit", "status": "completed"},
                {"id": 2, "task": "Apply changes", "description": "Modify files on new branch", "status": "pending"},
                {"id": 3, "task": "Create Pull Request", "description": "Submit PR for review", "status": "pending"}
            ],
            "estimated_changes": "Code modifications across selected target files."
        }

    return {
        "plan": plan_json,
        "target_files": plan_json.get("target_files", []),
        "status": "planning",
        "messages": messages + [
            {"role": "assistant", "content": f"I have built an execution plan for your request:\n\n**Summary:** {plan_json.get('summary')}"}
        ]
    }

async def branch_node(state: CodingAgentState) -> Dict[str, Any]:
    """Creates a separate feature branch in GitHub."""
    repo = state.get("repo", "octocat/Hello-World")
    base_branch = state.get("base_branch", "main")
    token = state.get("github_token")

    if not state.get("working_branch") or state.get("working_branch") == base_branch:
        messages = state.get("messages", [])
        user_prompt = "code-update"
        for msg in reversed(messages):
            if msg.get("role") == "user" or isinstance(msg, HumanMessage):
                user_prompt = msg.get("content") if isinstance(msg, dict) else msg.content
                break
        
        slug = slugify(user_prompt or "task")
        timestamp = int(time.time()) % 10000
        new_branch = f"agent/{slug}-{timestamp}"
    else:
        new_branch = state.get("working_branch")

    owner, repo_name = repo.split("/") if "/" in repo else ("octocat", repo)
    res = await github_service.create_branch(owner, repo_name, base_branch, new_branch, token=token)

    if not res.get("success"):
        return {
            "status": "error",
            "error_message": f"Failed to create branch: {res.get('error')}",
            "working_branch": new_branch
        }

    return {
        "working_branch": new_branch,
        "status": "branch_created"
    }

async def code_editor_node(state: CodingAgentState) -> Dict[str, Any]:
    """Fetches target files, generates code edits with LLM, and commits changes to GitHub branch."""
    repo = state.get("repo", "octocat/Hello-World")
    working_branch = state.get("working_branch", "main")
    target_files = state.get("target_files", [])
    token = state.get("github_token")
    owner, repo_name = repo.split("/") if "/" in repo else ("octocat", repo)

    messages = state.get("messages", [])
    user_prompt = "Apply updates"
    for msg in reversed(messages):
        if msg.get("role") == "user" or isinstance(msg, HumanMessage):
            user_prompt = msg.get("content") if isinstance(msg, dict) else msg.content
            break

    # If target_files is empty, try to get top file from tree
    if not target_files:
        tree_info = await github_service.get_repo_tree(owner, repo_name, branch=working_branch, token=token)
        files = [item["path"] for item in tree_info.get("tree", []) if item["type"] == "file"]
        if files:
            target_files = [files[0]]
        else:
            target_files = ["README.md"]

    modified_list = []
    llm = get_llm()

    for file_path in target_files:
        # Fetch file content
        file_res = await github_service.get_file_content(owner, repo_name, file_path, branch=working_branch, token=token)
        current_code = file_res.get("content", "# New file")

        sys_prompt = (
            "You are an expert AI Coding Agent. "
            "Your task is to edit the provided source code according to the user prompt.\n"
            "Return ONLY the complete updated file content. Do NOT include markdown code fences, backticks, or explanation. "
            "Output strictly raw code."
        )

        user_msg = (
            f"File Path: {file_path}\n"
            f"User Prompt: {user_prompt}\n\n"
            f"Current Code Content:\n{current_code}"
        )

        llm_res = await llm.ainvoke([SystemMessage(content=sys_prompt), HumanMessage(content=user_msg)])
        updated_code = llm_res.content.strip()

        # Clean backticks if any
        if updated_code.startswith("```"):
            lines = updated_code.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            updated_code = "\n".join(lines).strip()

        commit_msg = f"Agent edit: {user_prompt[:50]} [{file_path}]"
        commit_res = await github_service.commit_file_change(
            owner, repo_name, file_path, updated_code, working_branch, commit_msg, token=token
        )

        if commit_res.get("success"):
            modified_list.append({
                "path": file_path,
                "commit_sha": commit_res.get("commit_sha"),
                "status": "modified",
                "old_code": current_code,
                "new_code": updated_code
            })

    return {
        "modified_files": modified_list,
        "status": "executing"
    }

async def pr_creator_node(state: CodingAgentState) -> Dict[str, Any]:
    """Creates a Pull Request in GitHub from the working branch into the base branch."""
    repo = state.get("repo", "octocat/Hello-World")
    base_branch = state.get("base_branch", "main")
    working_branch = state.get("working_branch")
    token = state.get("github_token")
    owner, repo_name = repo.split("/") if "/" in repo else ("octocat", repo)

    messages = state.get("messages", [])
    user_prompt = "Task implementation"
    for msg in reversed(messages):
        if msg.get("role") == "user" or isinstance(msg, HumanMessage):
            user_prompt = msg.get("content") if isinstance(msg, dict) else msg.content
            break

    modified_files = state.get("modified_files", [])
    files_str = "\n".join([f"- `{f['path']}`" for f in modified_files]) if modified_files else "- Code updates"

    pr_title = f"[AI Coding Agent] {user_prompt[:50]}"
    pr_body = (
        f"## 🤖 Enterprise AI Coding Agent PR\n\n"
        f"**User Requirement:**\n> {user_prompt}\n\n"
        f"**Branch:** `{working_branch}` ➔ `{base_branch}`\n\n"
        f"**Modified Files:**\n{files_str}\n\n"
        f"--- \n*Generated automatically by Enterprise AI Workforce Platform Coding Agent.*"
    )

    pr_res = await github_service.create_pull_request(
        owner, repo_name, pr_title, pr_body, working_branch, base_branch, token=token
    )

    if pr_res.get("success"):
        return {
            "pr_info": pr_res,
            "status": "pr_created",
            "messages": messages + [
                {"role": "assistant", "content": f"✅ Changes committed to branch `{working_branch}` and opened Pull Request: [PR #{pr_res.get('pr_number')}]({pr_res.get('html_url')})"}
            ]
        }
    else:
        return {
            "status": "error",
            "error_message": f"Failed to create Pull Request: {pr_res.get('error')}"
        }
