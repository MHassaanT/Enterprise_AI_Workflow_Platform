"""
Test Suite — Agent 1: Customer Support Agent

Tests the LangGraph-based Customer Support Agent including:
- Graph construction and node registration
- Intent classification (greetings, tool-intent, document queries)
- Reasoning node logic (tool calls, responses, circuit breaker)
- Tool executor node
- Approval checkpoint routing
- Full integration flows
"""
import sys
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ═══════════════════════════════════════════════════════════════════════════════
# 1. GRAPH STRUCTURE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestCustomerSupportGraphStructure:
    """Validates that the Customer Support graph is built correctly."""

    def test_graph_compiles_without_error(self):
        """The graph should compile at import time without exceptions."""
        from graph.graph import customer_support_graph
        assert customer_support_graph is not None

    def test_graph_has_correct_nodes(self):
        """Graph must contain all 5 expected nodes."""
        from graph.graph import build_graph
        graph = build_graph()
        node_names = set(graph.get_graph().nodes.keys())
        expected = {"intent_classifier", "retriever", "reasoning", "approval_checkpoint", "tool_executor"}
        # LangGraph adds __start__ and __end__ nodes internally
        assert expected.issubset(node_names), f"Missing nodes: {expected - node_names}"

    def test_graph_routing_after_reasoning_respond(self):
        """When next_step is 'respond', routing should go to END."""
        from graph.graph import _route_after_reasoning
        state = {"next_step": "respond", "is_high_risk": False}
        from langgraph.graph import END
        assert _route_after_reasoning(state) == END

    def test_graph_routing_after_reasoning_tool_call_low_risk(self):
        """Low-risk tool call should route directly to tool_executor."""
        from graph.graph import _route_after_reasoning
        state = {"next_step": "tool_call", "is_high_risk": False}
        assert _route_after_reasoning(state) == "tool_executor"

    def test_graph_routing_after_reasoning_tool_call_high_risk(self):
        """High-risk tool call should route to approval_checkpoint first."""
        from graph.graph import _route_after_reasoning
        state = {"next_step": "tool_call", "is_high_risk": True}
        assert _route_after_reasoning(state) == "approval_checkpoint"

    def test_graph_routing_after_approval_approved(self):
        """Approved status routes to tool_executor."""
        from graph.graph import _route_after_approval
        state = {"approval_status": "approved"}
        assert _route_after_approval(state) == "tool_executor"

    def test_graph_routing_after_approval_rejected(self):
        """Rejected/pending status routes to END."""
        from graph.graph import _route_after_approval
        from langgraph.graph import END
        state = {"approval_status": "rejected"}
        assert _route_after_approval(state) == END

    def test_graph_routing_after_approval_pending(self):
        """Pending status routes to END (graph pauses)."""
        from graph.graph import _route_after_approval
        from langgraph.graph import END
        state = {"approval_status": "pending"}
        assert _route_after_approval(state) == END


# ═══════════════════════════════════════════════════════════════════════════════
# 2. INTENT CLASSIFIER NODE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestIntentClassifierNode:
    """Tests the FLARE-style intent classification node."""

    @pytest.mark.asyncio
    async def test_greeting_skips_retrieval(self):
        """Pure greetings should skip document retrieval."""
        from graph.nodes.intent_classifier import intent_classifier_node
        for greeting in ["hello", "hi", "hey", "thanks", "bye"]:
            result = await intent_classifier_node({"question": greeting})
            assert result["needs_retrieval"] is False, f"Greeting '{greeting}' should skip retrieval"

    @pytest.mark.asyncio
    async def test_tool_intent_skips_retrieval(self):
        """Queries about order status/tracking should skip RAG retrieval."""
        from graph.nodes.intent_classifier import intent_classifier_node
        tool_queries = [
            "check my order status",
            "where is my order",
            "track order ORD-12345",
            "I want a refund",
            "apply for refund",
        ]
        for q in tool_queries:
            result = await intent_classifier_node({"question": q})
            assert result["needs_retrieval"] is False, f"Tool query '{q}' should skip retrieval"

    @pytest.mark.asyncio
    async def test_product_question_enables_retrieval(self):
        """Product/policy questions should enable document retrieval."""
        from graph.nodes.intent_classifier import intent_classifier_node
        queries = [
            "What is your return policy?",
            "Tell me about premium features",
            "How does your SaaS pricing work?",
            "What compliance certifications do you have?",
        ]
        for q in queries:
            result = await intent_classifier_node({"question": q})
            assert result["needs_retrieval"] is True, f"Product query '{q}' should enable retrieval"

    @pytest.mark.asyncio
    async def test_system_notification_skips_retrieval(self):
        """System notifications (graph resumes) should skip retrieval."""
        from graph.nodes.intent_classifier import intent_classifier_node
        result = await intent_classifier_node({"question": "SYSTEM NOTIFICATION"})
        assert result["needs_retrieval"] is False

    @pytest.mark.asyncio
    async def test_empty_question_enables_retrieval(self):
        """Empty/missing question defaults to enabling retrieval."""
        from graph.nodes.intent_classifier import intent_classifier_node
        result = await intent_classifier_node({"question": ""})
        assert result["needs_retrieval"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# 3. REASONING NODE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestReasoningNode:
    """Tests the LLM reasoning node (brain of the agent)."""

    @pytest.mark.asyncio
    async def test_no_context_no_tool_intent_returns_out_of_context(self):
        """Without RAG context and non-tool-intent query, return 'out of context'."""
        from graph.nodes.reasoning import reasoning_node

        state = {
            "messages": [],
            "context": [],
            "question": "What is the weather today?",
            "agent_instance_id": "test-agent",
            "tenant_id": "test-tenant",
            "conversation_id": "conv-1",
            "user_id": "user-1",
            "tool_retry_count": 0,
        }

        with patch("graph.nodes.reasoning.get_tools_for_agent", AsyncMock(return_value=[])), \
             patch("graph.nodes.reasoning.get_allowed_tool_bindings", AsyncMock(return_value=[])):
            result = await reasoning_node(state)

        assert result["next_step"] == "respond"
        assert "out of context" in result["messages"][0].content.lower()

    @pytest.mark.asyncio
    async def test_circuit_breaker_triggers_after_max_retries(self):
        """After MAX_TOOL_RETRIES consecutive failures, stop looping."""
        from graph.nodes.reasoning import reasoning_node, MAX_TOOL_RETRIES

        state = {
            "messages": [],
            "context": [],
            "question": "check my order",
            "agent_instance_id": "test-agent",
            "tenant_id": "test-tenant",
            "conversation_id": "conv-1",
            "user_id": "user-1",
            "tool_retry_count": MAX_TOOL_RETRIES,
        }

        with patch("graph.nodes.reasoning.get_tools_for_agent", AsyncMock(return_value=[])), \
             patch("graph.nodes.reasoning.get_allowed_tool_bindings", AsyncMock(return_value=[])):
            result = await reasoning_node(state)

        assert result["next_step"] == "respond"
        assert "technical issue" in result["messages"][0].content.lower()

    @pytest.mark.asyncio
    async def test_greeting_with_no_context_responds(self):
        """Greeting queries should not be rejected as 'out of context'."""
        from graph.nodes.reasoning import reasoning_node
        from tests.conftest import MockAIMessage

        mock_llm = MagicMock()
        mock_llm.ainvoke = AsyncMock(return_value=MockAIMessage(content="Hello! How can I help you today?"))

        state = {
            "messages": [],
            "context": [],
            "question": "hello",
            "agent_instance_id": "test-agent",
            "tenant_id": "test-tenant",
            "conversation_id": "conv-1",
            "user_id": "user-1",
            "tool_retry_count": 0,
        }

        with patch("graph.nodes.reasoning.get_tools_for_agent", AsyncMock(return_value=[])), \
             patch("graph.nodes.reasoning.get_allowed_tool_bindings", AsyncMock(return_value=[])), \
             patch("graph.nodes.reasoning.get_llm", return_value=mock_llm):
            result = await reasoning_node(state)

        assert result["next_step"] == "respond"
        assert "hello" in result["messages"][0].content.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# 4. TOOL EXECUTOR NODE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestToolExecutorNode:
    """Tests the tool executor node."""

    @pytest.mark.asyncio
    async def test_successful_tool_execution(self):
        """Successful tool execution returns ToolMessage and resets retry count."""
        from graph.nodes.tool_executor import tool_executor_node

        state = {
            "pending_tool_call": {
                "name": "check_order_status",
                "arguments": {"order_id": "ORD-123"},
                "id": "call-1",
            },
            "tenant_id": "test-tenant",
            "agent_instance_id": "test-agent",
            "conversation_id": "conv-1",
            "user_id": "user-1",
            "tool_retry_count": 0,
        }

        with patch("graph.nodes.tool_executor.execute_mcp_tool",
                    AsyncMock(return_value="Order ORD-123: Delivered on 2024-01-15")), \
             patch("graph.nodes.tool_executor.write_audit_log", AsyncMock()):
            result = await tool_executor_node(state)

        assert result["tool_retry_count"] == 0  # Reset on success
        assert "ORD-123" in result["messages"][0].content
        assert result["pending_tool_call"] is None

    @pytest.mark.asyncio
    async def test_error_result_increments_retry_count(self):
        """Error results from the gateway should increment the retry counter."""
        from graph.nodes.tool_executor import tool_executor_node

        state = {
            "pending_tool_call": {
                "name": "check_order_status",
                "arguments": {"order_id": "BAD"},
                "id": "call-2",
            },
            "tenant_id": "test-tenant",
            "agent_instance_id": "test-agent",
            "conversation_id": "conv-1",
            "user_id": "user-1",
            "tool_retry_count": 1,
        }

        with patch("graph.nodes.tool_executor.execute_mcp_tool",
                    AsyncMock(return_value="Error: Order not found")), \
             patch("graph.nodes.tool_executor.write_audit_log", AsyncMock()):
            result = await tool_executor_node(state)

        assert result["tool_retry_count"] == 2  # Incremented

    @pytest.mark.asyncio
    async def test_exception_during_execution_returns_error(self):
        """Exceptions during tool execution return an error ToolMessage."""
        from graph.nodes.tool_executor import tool_executor_node

        state = {
            "pending_tool_call": {
                "name": "broken_tool",
                "arguments": {},
                "id": "call-3",
            },
            "tenant_id": "test-tenant",
            "agent_instance_id": "test-agent",
            "conversation_id": "conv-1",
            "user_id": "user-1",
            "tool_retry_count": 0,
        }

        with patch("graph.nodes.tool_executor.execute_mcp_tool",
                    AsyncMock(side_effect=Exception("Connection refused"))), \
             patch("graph.nodes.tool_executor.write_audit_log", AsyncMock()):
            result = await tool_executor_node(state)

        assert result["tool_retry_count"] == 1
        assert "execution failed" in result["messages"][0].content.lower()


# ═══════════════════════════════════════════════════════════════════════════════
# 5. APPROVAL CHECKPOINT NODE TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestApprovalCheckpointNode:
    """Tests the approval checkpoint node."""

    @pytest.mark.asyncio
    async def test_creates_approval_request(self):
        """Should create an approval request and set status to 'pending'."""
        from graph.nodes.approval_checkpoint import approval_checkpoint_node

        state = {
            "pending_tool_call": {
                "name": "issue_refund",
                "arguments": {"order_id": "ORD-123", "amount": 50.00},
                "id": "call-refund",
            },
            "tenant_id": "test-tenant",
            "agent_instance_id": "test-agent",
            "conversation_id": "conv-1",
            "user_id": "user-1",
            "messages": [],
        }

        with patch("graph.nodes.approval_checkpoint.create_approval_request",
                    AsyncMock(return_value="approval-uuid-123")):
            result = await approval_checkpoint_node(state)

        assert result["approval_status"] == "pending"
        assert result["approval_id"] == "approval-uuid-123"


# ═══════════════════════════════════════════════════════════════════════════════
# 6. STATE MODEL TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestAgentState:
    """Tests the AgentState TypedDict structure."""

    def test_agent_state_has_required_keys(self):
        """AgentState should define all required keys."""
        from graph.state import AgentState
        required_keys = {
            "messages", "context", "citations", "needs_retrieval",
            "next_step", "pending_tool_call", "tool_result",
            "is_high_risk", "approval_id", "approval_status",
            "tenant_id", "agent_instance_id", "conversation_id",
            "question", "user_id",
        }
        # TypedDict annotations
        annotations = AgentState.__annotations__
        assert required_keys.issubset(set(annotations.keys()))
