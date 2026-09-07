"""
Issue Investigator Node — analyzes a GitHub repository to investigate a customer-reported issue.

This node is triggered when the Customer Support Agent flags an unresolvable customer issue.
It fetches the repository structure and relevant files from GitHub, then uses the LLM to
perform root cause analysis correlating the customer complaint with code patterns.
"""

import json
from typing import Dict, Any
from graph.coding.state import CodingAgentState
from services.llm_gateway import get_llm
from services import github_service
from services.db_client import update_issue_investigation


async def issue_investigator_node(state: CodingAgentState) -> Dict[str, Any]:
    """Investigate a customer-reported issue by analyzing the connected GitHub repository."""
    
    repo = state.get("repo", "")
    issue_id = state.get("issue_id", "")
    issue_title = state.get("issue_title", "")
    issue_description = state.get("issue_description", "")
    issue_customer_message = state.get("issue_customer_message", "")
    token = state.get("github_token")
    base_branch = state.get("base_branch", "main")
    tenant_id = state.get("tenant_id", "")
    
    print(f"[ISSUE INVESTIGATOR] Starting investigation for issue {issue_id}: {issue_title}")
    print(f"[ISSUE INVESTIGATOR] Analyzing repo: {repo} on branch: {base_branch}")
    
    # Update issue status to investigating
    try:
        await update_issue_investigation(issue_id, {
            "tenantId": tenant_id,
            "investigationStatus": "investigating",
            "investigationRepo": repo,
            "investigationBranch": base_branch,
            "status": "investigating",
        })
    except Exception as e:
        print(f"[ISSUE INVESTIGATOR] Error updating issue status: {e}")
    
    # Step 1: Check for connected repository
    if not repo:
        print(f"[ISSUE INVESTIGATOR] No connected repository for tenant={tenant_id}. Performing conceptual analysis.")
        llm = get_llm()
        conceptual_prompt = (
            "You are a Senior Software Engineer analyzing a customer-reported issue.\n"
            "No source code repository is currently connected for this tenant. "
            "Perform a root-cause hypothesis and guidance based on the reported symptoms.\n\n"
            f"CUSTOMER ISSUE TITLE: {issue_title}\n"
            f"CUSTOMER ISSUE DESCRIPTION: {issue_description}\n"
            f"CUSTOMER'S ORIGINAL MESSAGE: {issue_customer_message}\n\n"
            "Output valid JSON with NO markdown backticks:\n"
            '{\n'
            '  "root_cause": "Hypothesized cause based on reported symptoms (no repository connected for direct file scan)",\n'
            '  "is_code_issue": false,\n'
            '  "confidence": "medium",\n'
            '  "relevant_files": [],\n'
            '  "recommendation": "Connect a GitHub repository in integrations to enable automated code inspection and PR fixes.",\n'
            '  "summary": "Conceptual analysis completed. Connect a GitHub repository to enable autonomous code inspection."\n'
            '}'
        )
        try:
            resp = await llm.ainvoke([{"role": "user", "content": conceptual_prompt}])
            raw_text = resp.content if hasattr(resp, 'content') else str(resp)
            raw_text = raw_text.strip().replace('```json', '').replace('```', '').strip()
            findings = json.loads(raw_text)
        except Exception as e:
            findings = {
                "root_cause": "No GitHub repository connected for direct code analysis.",
                "is_code_issue": False,
                "confidence": "low",
                "relevant_files": [],
                "recommendation": "Connect a repository in the Integrations settings.",
                "summary": "Automated code analysis skipped: no repository connected.",
            }

        root_cause = findings.get("root_cause", "No repository connected.")
        full_findings = (
            f"## Conceptual Analysis (No Repository Connected)\n{findings.get('summary', '')}\n\n"
            f"## Root Cause Hypothesis\n{root_cause}\n\n"
            f"## Recommendation\n{findings.get('recommendation', '')}\n"
        )

        try:
            await update_issue_investigation(issue_id, {
                "tenantId": tenant_id,
                "investigationStatus": "completed",
                "investigationRepo": "None (Not Connected)",
                "investigationBranch": base_branch,
                "investigationFindings": full_findings,
                "investigatedFiles": [],
                "rootCause": root_cause,
            })
        except Exception as e:
            print(f"[ISSUE INVESTIGATOR] Error updating issue: {e}")

        return {
            "investigation_findings": full_findings,
            "root_cause": root_cause,
            "investigated_files": [],
            "status": "investigated",
            "messages": state.get("messages", []) + [{
                "role": "assistant",
                "content": f"Conceptual investigation completed for issue: {issue_title}. Connect a GitHub repository to enable deep code scanning."
            }],
        }

    # Step 1b: Fetch repository file tree
    owner, repo_name = repo.split("/") if "/" in repo else ("octocat", repo)
    
    try:
        tree_info = await github_service.get_repo_tree(owner, repo_name, branch=base_branch, token=token)
    except Exception as e:
        error_msg = f"Failed to access repository {repo}: {str(e)}"
        print(f"[ISSUE INVESTIGATOR] {error_msg}")
        
        full_findings = (
            f"## Repository Access Issue\n{error_msg}\n\n"
            f"## Root Cause\nUnable to access repository '{repo}' with current credentials.\n\n"
            f"## Recommendation\nPlease verify GitHub OAuth credentials and repository permissions."
        )
        try:
            await update_issue_investigation(issue_id, {
                "tenantId": tenant_id,
                "investigationStatus": "completed",
                "investigationRepo": repo,
                "investigationBranch": base_branch,
                "investigationFindings": full_findings,
                "investigatedFiles": [],
                "rootCause": f"Unable to access repository {repo}: {str(e)}",
            })
        except Exception:
            pass

        return {
            "investigation_findings": full_findings,
            "root_cause": f"Unable to access repository {repo}: {str(e)}",
            "investigated_files": [],
            "status": "investigated",
            "error_message": error_msg,
            "messages": state.get("messages", []) + [{"role": "assistant", "content": error_msg}],
        }
    
    tree_items = tree_info.get("tree", [])
    tree_paths = [item["path"] for item in tree_items if item["type"] == "file"][:80]
    
    llm = get_llm()
    
    # Step 2: Use LLM to identify potentially relevant files based on the issue
    file_selector_prompt = (
        "You are a Senior Software Engineer investigating a customer-reported issue.\n\n"
        f"CUSTOMER ISSUE TITLE: {issue_title}\n"
        f"CUSTOMER ISSUE DESCRIPTION: {issue_description}\n"
        f"CUSTOMER'S ORIGINAL MESSAGE: {issue_customer_message}\n\n"
        "REPOSITORY FILE STRUCTURE:\n"
        + "\n".join(tree_paths) + "\n\n"
        "Based on the customer's issue, identify the 3-5 most likely files that could be related to this issue.\n"
        "Consider: API routes, service logic, database queries, frontend components, configuration files.\n\n"
        "Output ONLY a valid JSON array of file paths, e.g.:\n"
        '["src/routes/orders.js", "src/services/payment.js", "src/app/checkout/page.js"]\n'
        "Do NOT include markdown backticks or any other text."
    )
    
    try:
        selector_response = await llm.ainvoke([{"role": "user", "content": file_selector_prompt}])
        selector_text = selector_response.content if hasattr(selector_response, 'content') else str(selector_response)
        
        # Clean potential markdown backticks
        selector_text = selector_text.strip()
        if selector_text.startswith('```'):
            selector_text = selector_text.split('\n', 1)[1] if '\n' in selector_text else selector_text[3:]
        if selector_text.endswith('```'):
            selector_text = selector_text[:-3]
        selector_text = selector_text.strip()
        
        target_files = json.loads(selector_text)
        if not isinstance(target_files, list):
            target_files = []
    except Exception as e:
        print(f"[ISSUE INVESTIGATOR] Error parsing file selection: {e}")
        # Fallback: pick files matching common patterns
        target_files = [p for p in tree_paths if any(kw in p.lower() for kw in ['route', 'service', 'page', 'api', 'controller', 'handler'])][:5]
    
    # Filter to only files that actually exist in the repo
    target_files = [f for f in target_files if f in tree_paths][:5]
    print(f"[ISSUE INVESTIGATOR] Selected files for analysis: {target_files}")
    
    # Step 3: Fetch content of each identified file
    file_contents = []
    investigated_files_meta = []
    
    for file_path in target_files:
        try:
            content_data = await github_service.get_file_content(
                owner, repo_name, path=file_path, branch=base_branch, token=token
            )
            content = content_data.get("content", "")
            # Truncate very large files to avoid token limits
            if len(content) > 8000:
                content = content[:8000] + "\n... [TRUNCATED]"
            file_contents.append({"path": file_path, "content": content})
        except Exception as e:
            print(f"[ISSUE INVESTIGATOR] Error fetching {file_path}: {e}")
            file_contents.append({"path": file_path, "content": f"[Error fetching file: {e}]"})
    
    # Step 4: LLM root cause analysis
    analysis_prompt = (
        "You are a Senior Software Engineer performing root cause analysis on a customer-reported issue.\n\n"
        f"CUSTOMER ISSUE TITLE: {issue_title}\n"
        f"CUSTOMER ISSUE DESCRIPTION: {issue_description}\n"
        f"CUSTOMER'S ORIGINAL MESSAGE: {issue_customer_message}\n\n"
        "RELEVANT SOURCE CODE FILES:\n"
    )
    
    for fc in file_contents:
        analysis_prompt += f"\n--- FILE: {fc['path']} ---\n{fc['content']}\n"
    
    analysis_prompt += (
        "\n\nAnalyze the code above in relation to the customer's issue.\n"
        "Provide your analysis as valid JSON with NO markdown backticks:\n"
        '{\n'
        '  "root_cause": "Clear description of the identified root cause, OR \\"No code issue found - the issue may be environmental, configuration-related, or user error.\\" if no code bug is found",\n'
        '  "is_code_issue": true,\n'
        '  "confidence": "high|medium|low",\n'
        '  "relevant_files": [\n'
        '    {"path": "file/path.js", "relevance": "Why this file is relevant", "snippet": "key code line or function name"}\n'
        '  ],\n'
        '  "recommendation": "What should be done to fix this or further investigate",\n'
        '  "summary": "Brief 2-3 sentence executive summary of findings"\n'
        '}'
    )
    
    try:
        analysis_response = await llm.ainvoke([{"role": "user", "content": analysis_prompt}])
        analysis_text = analysis_response.content if hasattr(analysis_response, 'content') else str(analysis_response)
        
        # Clean markdown
        analysis_text = analysis_text.strip()
        if analysis_text.startswith('```'):
            analysis_text = analysis_text.split('\n', 1)[1] if '\n' in analysis_text else analysis_text[3:]
        if analysis_text.endswith('```'):
            analysis_text = analysis_text[:-3]
        analysis_text = analysis_text.strip()
        
        findings = json.loads(analysis_text)
    except Exception as e:
        print(f"[ISSUE INVESTIGATOR] Error parsing analysis: {e}")
        findings = {
            "root_cause": f"Analysis completed but results could not be parsed: {str(e)}",
            "is_code_issue": False,
            "confidence": "low",
            "relevant_files": [{"path": p, "relevance": "Selected for review", "snippet": ""} for p in target_files],
            "recommendation": "Manual review recommended.",
            "summary": "Automated analysis encountered an error. Manual review is recommended.",
        }
    
    # Build investigated files metadata
    investigated_files_meta = findings.get("relevant_files", [])
    root_cause = findings.get("root_cause", "Analysis inconclusive")
    investigation_summary = findings.get("summary", "Investigation completed.")
    recommendation = findings.get("recommendation", "")
    is_code_issue = findings.get("is_code_issue", False)
    confidence = findings.get("confidence", "low")
    
    full_findings = (
        f"## Investigation Summary\n{investigation_summary}\n\n"
        f"## Root Cause\n{root_cause}\n\n"
        f"## Confidence Level\n{confidence}\n\n"
        f"## Is Code Issue\n{'Yes' if is_code_issue else 'No'}\n\n"
        f"## Recommendation\n{recommendation}\n\n"
        f"## Files Analyzed\n"
        + "\n".join([f"- `{f.get('path', '')}`: {f.get('relevance', '')}" for f in investigated_files_meta])
    )
    
    print(f"[ISSUE INVESTIGATOR] Investigation complete. Root cause: {root_cause[:100]}...")
    print(f"[ISSUE INVESTIGATOR] Is code issue: {is_code_issue}, Confidence: {confidence}")
    
    # Update issue in database with investigation findings
    try:
        await update_issue_investigation(issue_id, {
            "tenantId": tenant_id,
            "investigationStatus": "completed",
            "investigationRepo": repo,
            "investigationBranch": base_branch,
            "investigationFindings": full_findings,
            "investigatedFiles": investigated_files_meta,
            "rootCause": root_cause,
        })
    except Exception as e:
        print(f"[ISSUE INVESTIGATOR] Error updating investigation results: {e}")
    
    return {
        "investigation_findings": full_findings,
        "root_cause": root_cause,
        "investigated_files": investigated_files_meta,
        "status": "investigated",
        "messages": state.get("messages", []) + [{
            "role": "assistant",
            "content": f"Investigation completed for issue: {issue_title}. {investigation_summary}"
        }],
    }
