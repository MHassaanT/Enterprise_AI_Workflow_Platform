"""
Test Suite — Agent 8: Workflow Engine

Tests the custom DAG execution engine including:
- WorkflowDefinition Pydantic model validation (TRIGGER, END, cycles, nested approvals)
- Node type models
- Execution engine node dispatch
- Variable substitution
"""
import sys, os, pytest
from datetime import datetime
from pydantic import ValidationError

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestWorkflowDefinitionValidation:
    """Tests DAG validation in WorkflowDefinition model."""

    def _make_def(self, nodes, edges=None):
        from models import WorkflowDefinition
        return WorkflowDefinition(nodes=nodes, edges=edges or {})

    def test_valid_simple_workflow(self):
        nodes = {
            "t1": {"node_id": "t1", "type": "TRIGGER", "triggerMode": "event"},
            "e1": {"node_id": "e1", "type": "END"},
        }
        wf = self._make_def(nodes, {"t1": ["e1"]})
        assert len(wf.nodes) == 2

    def test_missing_trigger_raises(self):
        nodes = {"e1": {"node_id": "e1", "type": "END"}}
        with pytest.raises(ValidationError, match="TRIGGER"):
            self._make_def(nodes)

    def test_missing_end_raises(self):
        nodes = {"t1": {"node_id": "t1", "type": "TRIGGER", "triggerMode": "event"}}
        with pytest.raises(ValidationError, match="END"):
            self._make_def(nodes)

    def test_multiple_triggers_raises(self):
        nodes = {
            "t1": {"node_id": "t1", "type": "TRIGGER", "triggerMode": "event"},
            "t2": {"node_id": "t2", "type": "TRIGGER", "triggerMode": "schedule"},
            "e1": {"node_id": "e1", "type": "END"},
        }
        with pytest.raises(ValidationError, match="exactly one TRIGGER"):
            self._make_def(nodes)

    def test_invalid_edge_target_raises(self):
        nodes = {
            "t1": {"node_id": "t1", "type": "TRIGGER", "triggerMode": "event"},
            "e1": {"node_id": "e1", "type": "END"},
        }
        with pytest.raises(ValidationError, match="non-existent"):
            self._make_def(nodes, {"t1": ["nonexistent_node"]})

    def test_cycle_detection_raises(self):
        nodes = {
            "t1": {"node_id": "t1", "type": "TRIGGER", "triggerMode": "event"},
            "a1": {"node_id": "a1", "type": "AGENT", "moduleType": "CustomerSupport", "outputVariable": "out"},
            "a2": {"node_id": "a2", "type": "AGENT", "moduleType": "HR", "outputVariable": "out2"},
            "e1": {"node_id": "e1", "type": "END"},
        }
        edges = {"t1": ["a1"], "a1": ["a2"], "a2": ["a1"]}  # Cycle: a1 -> a2 -> a1
        with pytest.raises(ValidationError, match="cycle"):
            self._make_def(nodes, edges)

    def test_nested_approvals_raises(self):
        nodes = {
            "t1": {"node_id": "t1", "type": "TRIGGER", "triggerMode": "event"},
            "ap1": {"node_id": "ap1", "type": "APPROVAL", "requiredRole": "Admin",
                    "approvalPayload": {}, "timeout": 3600,
                    "onApprove": "ap2", "onReject": "e1", "onTimeout": "e1"},
            "ap2": {"node_id": "ap2", "type": "APPROVAL", "requiredRole": "Finance",
                    "approvalPayload": {}, "timeout": 3600,
                    "onApprove": "e1", "onReject": "e1", "onTimeout": "e1"},
            "e1": {"node_id": "e1", "type": "END"},
        }
        with pytest.raises(ValidationError, match="Nested APPROVAL"):
            self._make_def(nodes)

    def test_condition_node_edges_validated(self):
        nodes = {
            "t1": {"node_id": "t1", "type": "TRIGGER", "triggerMode": "event"},
            "c1": {"node_id": "c1", "type": "CONDITION", "expression": "x > 5",
                   "onTrue": "e1", "onFalse": "e1"},
            "e1": {"node_id": "e1", "type": "END"},
        }
        wf = self._make_def(nodes, {"t1": ["c1"]})
        assert "c1" in wf.nodes


class TestNodeModels:
    def test_trigger_node(self):
        from models import TriggerNode
        t = TriggerNode(node_id="t1", triggerMode="schedule", cronExpression="0 * * * *")
        assert t.type == "TRIGGER"
        assert t.triggerMode == "schedule"

    def test_agent_node(self):
        from models import AgentNode
        a = AgentNode(node_id="a1", moduleType="Sales", outputVariable="sales_out")
        assert a.type == "AGENT"
        assert a.moduleType == "Sales"

    def test_tool_node(self):
        from models import ToolNode
        t = ToolNode(node_id="tool1", mcp="Gmail", actionDescription="Send email")
        assert t.type == "TOOL"
        assert t.outputVariable == "tool_output"

    def test_approval_node(self):
        from models import ApprovalNode
        a = ApprovalNode(node_id="ap1", requiredRole="Admin", approvalPayload={"amount": 500},
                         timeout=3600, onApprove="next", onReject="end", onTimeout="end")
        assert a.type == "APPROVAL"

    def test_condition_node(self):
        from models import ConditionNode
        c = ConditionNode(node_id="c1", expression="amount > 1000", onTrue="approve", onFalse="reject")
        assert c.type == "CONDITION"

    def test_delay_node(self):
        from models import DelayNode
        d = DelayNode(node_id="d1", duration=300)
        assert d.type == "DELAY"

    def test_end_node(self):
        from models import EndNode
        e = EndNode(node_id="e1", notifyUser=True, notificationMessage="Done!")
        assert e.type == "END"
        assert e.notifyUser is True

    def test_webhook_reply_node(self):
        from models import WebhookReplyNode
        w = WebhookReplyNode(node_id="w1", statusCode=200, payload={"ok": True})
        assert w.type == "WEBHOOK_REPLY"


class TestStepLogModel:
    def test_step_log_creation(self):
        from models import StepLog
        log = StepLog(
            step_id="s1", node_id="n1", node_type="AGENT",
            input={"q": "test"}, output={"a": "response"},
            status="completed", duration_ms=150, executed_at=datetime.now()
        )
        assert log.status == "completed"
        assert log.error is None

    def test_step_log_with_error(self):
        from models import StepLog
        log = StepLog(
            step_id="s2", node_id="n2", node_type="TOOL",
            input={}, status="failed", duration_ms=50,
            executed_at=datetime.now(), error="Connection refused"
        )
        assert log.status == "failed"
        assert "Connection refused" in log.error


class TestWorkflowExecutionState:
    def test_execution_state_creation(self):
        from models import WorkflowExecutionState
        state = WorkflowExecutionState(
            workflow_id="wf-1", run_id="run-1",
            tenant_id="t-1", status="running"
        )
        assert state.status == "running"
        assert state.current_node_id is None
        assert state.node_execution_order == []
        assert state.variables == {}

    def test_execution_state_with_variables(self):
        from models import WorkflowExecutionState
        state = WorkflowExecutionState(
            workflow_id="wf-1", run_id="run-1",
            tenant_id="t-1", status="running",
            variables={"trigger": {"source": "webhook"}}
        )
        assert state.variables["trigger"]["source"] == "webhook"


class TestVariableSubstitution:
    def test_substitute_simple(self):
        from workflow_utils import substitute_variables
        mapping = {"email": "{{trigger.email}}", "name": "static_value"}
        variables = {"trigger": {"email": "test@example.com"}}
        result = substitute_variables(mapping, variables)
        assert result["email"] == "test@example.com"
        assert result["name"] == "static_value"

    def test_substitute_missing_variable_raises(self):
        from workflow_utils import substitute_variables
        mapping = {"val": "{{nonexistent.key}}"}
        variables = {}
        # Implementation raises KeyError when variable path is not found
        with pytest.raises(KeyError):
            substitute_variables(mapping, variables)


class TestExpressionEvaluation:
    def test_evaluate_true(self):
        from workflow_utils import evaluate_expression
        # evaluate_expression uses {{var.path}} syntax to resolve context variables
        result = evaluate_expression("{{amount}} > 100", {"amount": 500})
        assert result is True

    def test_evaluate_false(self):
        from workflow_utils import evaluate_expression
        result = evaluate_expression("{{amount}} > 100", {"amount": 50})
        assert result is False

    def test_evaluate_equality(self):
        from workflow_utils import evaluate_expression
        result = evaluate_expression("{{status}} == 'active'", {"status": "active"})
        assert result is True
