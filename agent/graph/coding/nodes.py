"""
Coding Agent LangGraph Nodes

Defines the execution nodes for the Coding Agent pipeline:
1. planner_node: Generates structured task execution plan after analyzing repository structure.
2. branch_node: Ensures the dedicated branch 'Branch-for-EAIWP-Coding-Agent' exists in GitHub repo.
3. code_editor_node: Analyzes repository file tree, selects actual source code files (e.g. Next.js page components), generates edits with LLM, and commits to branch.
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

DEFAULT_AGENT_BRANCH = "Branch-for-EAIWP-Coding-Agent"

async def planner_node(state: CodingAgentState) -> Dict[str, Any]:
    """Generates a structured execution plan for code modifications after analyzing the repo tree."""
    repo = state.get("repo", "octocat/Hello-World")
    messages = state.get("messages", [])
    user_prompt = ""
    for msg in reversed(messages):
        if msg.get("role") == "user" or isinstance(msg, HumanMessage):
            user_prompt = msg.get("content") if isinstance(msg, dict) else msg.content
            break

    if not user_prompt:
        user_prompt = "Refactor and optimize code base."

    # Fetch file tree for context
    owner, repo_name = repo.split("/") if "/" in repo else ("octocat", repo)
    token = state.get("github_token")
    base_branch = state.get("base_branch", "main")

    tree_info = await github_service.get_repo_tree(owner, repo_name, branch=base_branch, token=token)
    tree_items = tree_info.get("tree", [])
    tree_paths = [item["path"] for item in tree_items if item["type"] == "file"][:60]

    sys_prompt = (
        "You are an expert Senior Software Engineer AI Agent.\n"
        "Analyze the user's task and the repository file structure below.\n"
        "Your job is to identify the ACTUAL source code files (e.g. Next.js page components like `app/page.tsx`, `app/page.js`, `pages/index.js`, `src/app/page.js`, React components, or style sheets) that need to be edited to fulfill the user's request.\n"
        "CRITICAL RULE: DO NOT select `README.md`, `package.json`, or `.gitignore` unless the user explicitly requested updates to documentation or config files.\n"
        "Output ONLY valid JSON with no markdown block or backticks in this exact schema:\n"
        "{\n"
        '  "summary": "Brief 1-2 sentence plan summary",\n'
        '  "target_files": ["app/page.tsx"],\n'
        '  "steps": [\n'
        '    {"id": 1, "task": "Analyze codebase", "description": "Identify target page/component files", "status": "completed"},\n'
        '    {"id": 2, "task": "Edit source code", "description": "Recreate/update target code files", "status": "pending"},\n'
        '    {"id": 3, "task": "Open Pull Request", "description": "Submit PR on branch Branch-for-EAIWP-Coding-Agent", "status": "pending"}\n'
        '  ],\n'
        '  "estimated_changes": "Description of code edits across selected target files."\n'
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
    if plan_content.startswith("```"):
        plan_content = re.sub(r"^```[a-z]*\n?", "", plan_content)
        plan_content = re.sub(r"\n?```$", "", plan_content).strip()

    try:
        plan_json = json.loads(plan_content)
    except Exception:
        # Fallback target file discovery if JSON parsing failed
        target_candidates = [
            f for f in tree_paths if any(p in f.lower() for p in [
                "app/page.", "pages/index.", "src/app/page.", "src/pages/index.", "index.html"
            ])
        ]
        chosen_targets = target_candidates[:1] if target_candidates else ([f for f in tree_paths if not f.lower().endswith('.md')][:1] or ["app/page.js"])

        plan_json = {
            "summary": f"Plan for: {user_prompt[:60]}",
            "target_files": chosen_targets,
            "steps": [
                {"id": 1, "task": "Analyze codebase", "description": "Identify target page files", "status": "completed"},
                {"id": 2, "task": "Apply source code changes", "description": f"Modify {chosen_targets[0]} on {DEFAULT_AGENT_BRANCH}", "status": "pending"},
                {"id": 3, "task": "Create Pull Request", "description": f"Submit PR into {base_branch}", "status": "pending"}
            ],
            "estimated_changes": f"Code modifications in {chosen_targets[0]}"
        }

    return {
        "plan": plan_json,
        "target_files": plan_json.get("target_files", []),
        "working_branch": DEFAULT_AGENT_BRANCH,
        "status": "planning",
        "messages": messages + [
            {"role": "assistant", "content": f"I have analyzed the repository structure and built an execution plan:\n\n**Summary:** {plan_json.get('summary')}\n**Target File(s):** {', '.join([f'`{f}`' for f in plan_json.get('target_files', [])])}"}
        ]
    }

async def branch_node(state: CodingAgentState) -> Dict[str, Any]:
    """Ensures the dedicated working branch 'Branch-for-EAIWP-Coding-Agent' exists in GitHub."""
    repo = state.get("repo", "octocat/Hello-World")
    base_branch = state.get("base_branch", "main")
    token = state.get("github_token")

    # Use fixed branch 'Branch-for-EAIWP-Coding-Agent'
    working_branch = state.get("working_branch") or DEFAULT_AGENT_BRANCH

    owner, repo_name = repo.split("/") if "/" in repo else ("octocat", repo)
    res = await github_service.create_branch(owner, repo_name, base_branch, working_branch, token=token)

    if not res.get("success"):
        return {
            "status": "error",
            "error_message": f"Failed to create/resolve branch '{working_branch}': {res.get('error')}",
            "working_branch": working_branch
        }

    return {
        "working_branch": working_branch,
        "status": "branch_created"
    }

async def code_editor_node(state: CodingAgentState) -> Dict[str, Any]:
    """Analyzes repo structure, resolves actual source code files, generates edits with LLM, and commits to branch."""
    repo = state.get("repo", "octocat/Hello-World")
    working_branch = state.get("working_branch") or DEFAULT_AGENT_BRANCH
    target_files = state.get("target_files", [])
    token = state.get("github_token")
    owner, repo_name = repo.split("/") if "/" in repo else ("octocat", repo)

    messages = state.get("messages", [])
    user_prompt = "Apply updates"
    for msg in reversed(messages):
        if msg.get("role") == "user" or isinstance(msg, HumanMessage):
            user_prompt = msg.get("content") if isinstance(msg, dict) else msg.content
            break

    # Fetch full file tree to analyze repository structure
    tree_info = await github_service.get_repo_tree(owner, repo_name, branch=working_branch, token=token)
    all_files = [item["path"] for item in tree_info.get("tree", []) if item["type"] == "file"]

    # Filter out invalid target files (e.g. README.md if user didn't ask for README)
    is_readme_requested = "readme" in user_prompt.lower() or "documentation" in user_prompt.lower()
    if target_files:
        target_files = [f for f in target_files if is_readme_requested or not f.lower().endswith("readme.md")]

    # If target_files is empty, use LLM to select the relevant code file(s) from tree
    if not target_files:
        llm = get_llm()
        selector_sys_prompt = (
            "You are a Senior Software Engineer AI Agent.\n"
            "Analyze the repository file tree and user prompt below.\n"
            "Identify the 1 to 3 primary source code files (e.g., Next.js landing page routes like `app/page.tsx`, `app/page.js`, `pages/index.js`, `src/app/page.js`, main components, or styles) that MUST be edited to fulfill the user's requirement.\n"
            "CRITICAL: Never select `README.md`, `package.json`, or `.gitignore` unless the user explicitly requested documentation/config updates.\n"
            "Output ONLY valid JSON in this exact schema: {\"target_files\": [\"path/to/file1.js\"]}"
        )
        selector_user_prompt = (
            f"Repository Files:\n{json.dumps(all_files[:80], indent=2)}\n\n"
            f"User Prompt: {user_prompt}"
        )
        try:
            sel_res = await llm.ainvoke([SystemMessage(content=selector_sys_prompt), HumanMessage(content=selector_user_prompt)])
            sel_text = sel_res.content.strip()
            if sel_text.startswith("```"):
                sel_text = re.sub(r"^```[a-z]*\n?", "", sel_text)
                sel_text = re.sub(r"\n?```$", "", sel_text).strip()
            parsed = json.loads(sel_text)
            if parsed.get("target_files") and isinstance(parsed["target_files"], list):
                valid_targets = [f for f in parsed["target_files"] if f in all_files]
                if valid_targets:
                    target_files = valid_targets
        except Exception as e:
            print(f"[CODE EDITOR] LLM file selector warning: {e}")

    # Fallback heuristic if LLM selector couldn't find a file
    if not target_files:
        landing_candidates = [
            f for f in all_files if any(p in f.lower() for p in [
                "app/page.", "pages/index.", "src/app/page.", "src/pages/index.", 
                "index.html", "app.js", "app.tsx", "main.js", "index.js"
            ])
        ]
        if landing_candidates:
            target_files = [landing_candidates[0]]
        else:
            non_docs = [f for f in all_files if not f.lower().endswith(".md") and not f.startswith(".")]
            target_files = [non_docs[0]] if non_docs else (all_files[:1] or ["app/page.js"])

    modified_list = []
    llm = get_llm()

    for file_path in target_files:
        # Fetch file content
        file_res = await github_service.get_file_content(owner, repo_name, file_path, branch=working_branch, token=token)
        current_code = file_res.get("content", "")

        sys_prompt = (
            "You are an expert AI Coding Agent specializing in modern web development (Next.js, React, Tailwind, HTML, CSS, JS/TS).\n"
            "Your task is to edit/recreate the provided source code file according to the user's prompt.\n"
            "Ensure the code is complete, beautiful, production-ready, and fully functional.\n"
            "Return ONLY the complete updated source code file content. Do NOT include markdown code fences, backticks, or explanatory text before or after. Output strictly raw code."
        )

        user_msg = (
            f"File Path: {file_path}\n"
            f"User Requirement: {user_prompt}\n\n"
            f"Current Source Code:\n{current_code if current_code else '(Empty file)'}"
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
        "target_files": target_files,
        "status": "executing"
    }

async def pr_creator_node(state: CodingAgentState) -> Dict[str, Any]:
    """Creates or updates a Pull Request in GitHub from 'Branch-for-EAIWP-Coding-Agent' into the base branch."""
    repo = state.get("repo", "octocat/Hello-World")
    base_branch = state.get("base_branch", "main")
    working_branch = state.get("working_branch") or DEFAULT_AGENT_BRANCH
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
                {"role": "assistant", "content": f"✅ Changes committed to `{working_branch}` and opened Pull Request: [PR #{pr_res.get('pr_number')}]({pr_res.get('html_url')})"}
            ]
        }
    else:
        return {
            "status": "error",
            "error_message": f"Failed to create Pull Request: {pr_res.get('error')}"
        }
