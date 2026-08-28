"""
Test Suite — Agent 6: Coding Agent

Tests the LangGraph coding pipeline: graph structure, node routing,
planner, branch, code editor, and PR creator nodes.
"""
import sys, os, pytest, json
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestCodingGraphStructure:
    def test_graph_compiles(self):
        from graph.coding.graph import coding_agent_graph
        assert coding_agent_graph is not None

    def test_graph_has_four_nodes(self):
        from graph.coding.graph import build_coding_graph
        graph = build_coding_graph()
        node_names = set(graph.get_graph().nodes.keys())
        expected = {"planner", "branch", "code_editor", "pr_creator"}
        assert expected.issubset(node_names)

    def test_plan_mode_routing(self):
        from graph.coding.graph import _route_initial
        assert _route_initial({"plan_mode": True, "status": "idle"}) == "planner"
        assert _route_initial({"plan_mode": True, "status": "executing"}) == "branch"
        assert _route_initial({"plan_mode": False, "status": "idle"}) == "branch"
        assert _route_initial({}) == "branch"


class TestCodingState:
    def test_state_has_expected_keys(self):
        from graph.coding.state import CodingAgentState
        annotations = CodingAgentState.__annotations__
        expected = {"messages", "repo", "base_branch", "working_branch", "plan_mode", "status"}
        assert expected.issubset(set(annotations.keys()))


class TestPlannerNode:
    @pytest.mark.asyncio
    async def test_planner_generates_plan(self, mock_github_service):
        from graph.coding.nodes import planner_node
        from tests.conftest import MockAIMessage

        plan_json = json.dumps({
            "summary": "Update landing page design",
            "target_files": ["app/page.js"],
            "steps": [
                {"id": 1, "task": "Analyze", "description": "Check structure", "status": "completed"},
                {"id": 2, "task": "Edit", "description": "Update page.js", "status": "pending"}
            ],
            "estimated_changes": "Redesign landing page"
        })

        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=MockAIMessage(content=plan_json))

        state = {
            "repo": "org/repo",
            "base_branch": "main",
            "messages": [{"role": "user", "content": "Redesign the landing page"}],
            "github_token": "fake-token",
        }

        with patch("graph.coding.nodes.get_llm", return_value=mock_llm):
            result = await planner_node(state)

        assert result["status"] == "planning"
        assert result["working_branch"] == "Branch-for-EAIWP-Coding-Agent"
        assert "app/page.js" in result["target_files"]
        assert result["plan"]["summary"] == "Update landing page design"

    @pytest.mark.asyncio
    async def test_planner_handles_malformed_json(self, mock_github_service):
        from graph.coding.nodes import planner_node
        from tests.conftest import MockAIMessage

        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=MockAIMessage(content="Not valid JSON at all"))

        state = {
            "repo": "org/repo", "base_branch": "main",
            "messages": [{"role": "user", "content": "Fix bugs"}],
            "github_token": "fake",
        }

        with patch("graph.coding.nodes.get_llm", return_value=mock_llm):
            result = await planner_node(state)

        # Should fallback to heuristic target file detection
        assert result["status"] == "planning"
        assert len(result["target_files"]) >= 1


class TestBranchNode:
    @pytest.mark.asyncio
    async def test_branch_creation_success(self, mock_github_service):
        from graph.coding.nodes import branch_node
        state = {"repo": "org/repo", "base_branch": "main",
                 "working_branch": "", "github_token": "fake"}
        result = await branch_node(state)
        assert result["status"] == "branch_created"
        assert result["working_branch"] == "Branch-for-EAIWP-Coding-Agent"

    @pytest.mark.asyncio
    async def test_branch_creation_failure(self):
        from graph.coding.nodes import branch_node

        with patch("services.github_service.create_branch",
                    AsyncMock(return_value={"success": False, "error": "Permission denied"})):
            state = {"repo": "org/repo", "base_branch": "main",
                     "working_branch": "", "github_token": "fake"}
            result = await branch_node(state)
        assert result["status"] == "error"
        assert "Permission denied" in result.get("error_message", "")


class TestCodeEditorNode:
    @pytest.mark.asyncio
    async def test_code_editor_modifies_files(self, mock_github_service):
        from graph.coding.nodes import code_editor_node
        from tests.conftest import MockAIMessage

        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=MockAIMessage(
            content="export default function Page() { return <div>Updated!</div> }"
        ))

        state = {
            "repo": "org/repo", "working_branch": "test-branch",
            "target_files": ["app/page.js"], "github_token": "fake",
            "messages": [{"role": "user", "content": "Update the page"}],
        }

        with patch("graph.coding.nodes.get_llm", return_value=mock_llm):
            result = await code_editor_node(state)

        assert result["status"] == "executing"
        assert len(result["modified_files"]) == 1
        assert result["modified_files"][0]["path"] == "app/page.js"
        assert result["modified_files"][0]["status"] == "modified"


class TestPRCreatorNode:
    @pytest.mark.asyncio
    async def test_pr_creation_success(self, mock_github_service):
        from graph.coding.nodes import pr_creator_node
        state = {
            "repo": "org/repo", "base_branch": "main",
            "working_branch": "test-branch", "github_token": "fake",
            "messages": [{"role": "user", "content": "Update page"}],
            "modified_files": [{"path": "app/page.js", "commit_sha": "abc"}],
        }
        result = await pr_creator_node(state)
        assert result["status"] == "pr_created"
        assert result["pr_info"]["pr_number"] == 42

    @pytest.mark.asyncio
    async def test_pr_creation_failure(self):
        from graph.coding.nodes import pr_creator_node
        with patch("services.github_service.create_pull_request",
                    AsyncMock(return_value={"success": False, "error": "No commits"})):
            state = {
                "repo": "org/repo", "base_branch": "main",
                "working_branch": "test-branch", "github_token": "fake",
                "messages": [{"role": "user", "content": "Fix"}],
                "modified_files": [],
            }
            result = await pr_creator_node(state)
        assert result["status"] == "error"
