"""
Shared pytest fixtures for the Enterprise AI Workflow Platform agent test suite.

All external I/O is mocked:
- LLM calls (OpenRouter / Gemini / Ollama)
- Database queries (PostgreSQL via internal backend)
- HTTP requests (httpx)
- MCP tool gateway
- GitHub service
- Gmail adapter
"""
import sys
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure the agent package root is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Mock LLM ──────────────────────────────────────────────────────────────────

class MockAIMessage:
    """Mimics langchain_core.messages.AIMessage for test purposes."""

    def __init__(self, content: str, tool_calls=None):
        self.content = content
        self.type = "ai"
        self.tool_calls = tool_calls or []

    def __getattr__(self, name):
        if name == "tool_calls":
            return self.tool_calls
        raise AttributeError(name)


class MockLLM:
    """
    A mock LangChain-compatible LLM.
    Returns a predictable response from `default_response` or from
    a list of queued responses (`response_queue`).
    """

    def __init__(self, default_response: str = '{"status": "ok"}'):
        self.default_response = default_response
        self.response_queue: list[str] = []
        self.call_count = 0

    async def ainvoke(self, messages, **kwargs):
        self.call_count += 1
        if self.response_queue:
            content = self.response_queue.pop(0)
        else:
            content = self.default_response
        return MockAIMessage(content=content)

    def invoke(self, messages, **kwargs):
        self.call_count += 1
        if self.response_queue:
            content = self.response_queue.pop(0)
        else:
            content = self.default_response
        return MockAIMessage(content=content)

    def bind_tools(self, tools, **kwargs):
        """Returns self — tools don't change mock behavior."""
        return self


@pytest.fixture
def mock_llm():
    """Provides a MockLLM instance and patches `get_llm` to return it."""
    llm = MockLLM()
    with patch("services.llm_gateway.get_llm", return_value=llm):
        yield llm


# ── Mock DB Query ─────────────────────────────────────────────────────────────

@pytest.fixture
def mock_db_query():
    """Patches execute_db_query to return empty rows by default."""
    mock = AsyncMock(return_value={"rows": [], "rowCount": 0})
    with patch("services.db_client.execute_db_query", mock):
        yield mock


# ── Mock httpx ────────────────────────────────────────────────────────────────

class MockHTTPResponse:
    """Mimics httpx.Response."""

    def __init__(self, json_data=None, status_code=200, text=""):
        self._json_data = json_data or {}
        self.status_code = status_code
        self.text = text

    def json(self):
        return self._json_data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


@pytest.fixture
def mock_httpx():
    """Patches httpx.AsyncClient for all internal HTTP calls."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.get = AsyncMock(return_value=MockHTTPResponse(json_data={"tools": []}))
    mock_client.post = AsyncMock(return_value=MockHTTPResponse(json_data={"rows": [], "rowCount": 0}))
    mock_client.patch = AsyncMock(return_value=MockHTTPResponse(json_data={"success": True}))

    with patch("httpx.AsyncClient", return_value=mock_client):
        yield mock_client


# ── Mock MCP Tool ─────────────────────────────────────────────────────────────

@pytest.fixture
def mock_mcp_tool():
    """Patches the centralized MCP gateway execute function."""
    mock = AsyncMock(return_value="Tool executed successfully.")
    with patch("tool_gateway.centralized_gateway.execute_mcp_tool", mock):
        yield mock


# ── Mock GitHub Service ───────────────────────────────────────────────────────

@pytest.fixture
def mock_github_service():
    """Patches all GitHub service async methods."""
    mocks = {
        "list_repositories": AsyncMock(return_value=[
            {"full_name": "org/repo", "name": "repo", "private": False}
        ]),
        "get_repo_tree": AsyncMock(return_value={
            "tree": [
                {"path": "app/page.js", "type": "file"},
                {"path": "package.json", "type": "file"},
                {"path": "README.md", "type": "file"},
                {"path": "src/components/Header.js", "type": "file"},
            ]
        }),
        "get_file_content": AsyncMock(return_value={
            "content": "export default function Page() { return <div>Hello</div> }",
            "sha": "abc123"
        }),
        "create_branch": AsyncMock(return_value={"success": True, "ref": "refs/heads/test-branch"}),
        "commit_file_change": AsyncMock(return_value={"success": True, "commit_sha": "def456"}),
        "create_pull_request": AsyncMock(return_value={
            "success": True, "pr_number": 42, "html_url": "https://github.com/org/repo/pull/42"
        }),
    }
    patches = {}
    for method_name, mock_fn in mocks.items():
        p = patch(f"services.github_service.{method_name}", mock_fn)
        patches[method_name] = p
        p.start()

    yield mocks

    for p in patches.values():
        p.stop()


# ── Mock asyncpg ──────────────────────────────────────────────────────────────

@pytest.fixture
def mock_asyncpg():
    """Patches asyncpg.connect to return a mock connection."""
    mock_conn = AsyncMock()
    mock_conn.execute = AsyncMock()
    mock_conn.fetch = AsyncMock(return_value=[])
    mock_conn.fetchrow = AsyncMock(return_value=None)
    mock_conn.close = AsyncMock()

    with patch("asyncpg.connect", AsyncMock(return_value=mock_conn)):
        yield mock_conn
