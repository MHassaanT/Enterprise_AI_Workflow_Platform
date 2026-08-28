"""
Test Suite — Agent 7: Analytics Agent

Tests the Analytics LangGraph pipeline: graph structure, intent routing,
and all 6 nodes (supervisor, quickview, sql_generator, executor, visualizer, digest).
"""
import sys, os, pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestAnalyticsGraphStructure:
    def test_graph_compiles(self):
        from graph.analytics.graph import analytics_agent_graph
        assert analytics_agent_graph is not None

    def test_graph_has_six_nodes(self):
        from graph.analytics.graph import build_analytics_graph
        graph = build_analytics_graph()
        node_names = set(graph.get_graph().nodes.keys())
        expected = {"supervisor", "quickview", "sql_generator", "executor", "visualizer", "digest"}
        assert expected.issubset(node_names)

    def test_intent_routing_quickview(self):
        from graph.analytics.graph import _route_intent
        assert _route_intent({"intent": "quickview"}) == "quickview"

    def test_intent_routing_digest(self):
        from graph.analytics.graph import _route_intent
        assert _route_intent({"intent": "executive_digest"}) == "digest"

    def test_intent_routing_default_sql(self):
        from graph.analytics.graph import _route_intent
        assert _route_intent({"intent": "text_to_sql"}) == "sql_generator"
        assert _route_intent({}) == "sql_generator"


class TestAnalyticsState:
    def test_state_has_expected_keys(self):
        from graph.analytics.state import AnalyticsAgentState
        annotations = AnalyticsAgentState.__annotations__
        expected = {"tenant_id", "user_query", "intent", "status"}
        assert expected.issubset(set(annotations.keys()))


class TestSupervisorNode:
    def test_dashboard_query_sets_quickview(self):
        from graph.analytics.nodes import supervisor_node
        state = {"user_query": "show me dashboard overview", "intent": "text_to_sql", "status": "idle"}
        result = supervisor_node(state)
        assert result["intent"] == "quickview"

    def test_report_query_sets_digest(self):
        from graph.analytics.nodes import supervisor_node
        state = {"user_query": "generate executive report", "intent": "text_to_sql", "status": "idle"}
        result = supervisor_node(state)
        assert result["intent"] == "executive_digest"

    def test_sql_query_keeps_text_to_sql(self):
        from graph.analytics.nodes import supervisor_node
        state = {"user_query": "how many employees by department", "intent": "text_to_sql", "status": "idle"}
        result = supervisor_node(state)
        assert result["intent"] == "text_to_sql"

    def test_quickview_intent_passthrough(self):
        from graph.analytics.nodes import supervisor_node
        state = {"user_query": "anything", "intent": "quickview", "status": "idle"}
        result = supervisor_node(state)
        assert result["intent"] == "quickview"

    def test_status_set_to_analyzing(self):
        from graph.analytics.nodes import supervisor_node
        state = {"user_query": "test", "intent": "text_to_sql", "status": "idle"}
        result = supervisor_node(state)
        assert result["status"] == "analyzing"


class TestQuickviewNode:
    def test_returns_complete_metrics(self):
        from graph.analytics.nodes import quickview_node
        state = {"quickview_data": None, "status": "analyzing"}
        result = quickview_node(state)
        qv = result["quickview_data"]
        assert "employee_metrics" in qv
        assert "financial_metrics" in qv
        assert "project_metrics" in qv
        assert "sales_metrics" in qv
        assert "procurement_metrics" in qv
        assert "ai_health_metrics" in qv
        assert result["status"] == "completed"

    def test_employee_metrics_structure(self):
        from graph.analytics.nodes import quickview_node
        state = {"quickview_data": None, "status": ""}
        result = quickview_node(state)
        em = result["quickview_data"]["employee_metrics"]
        assert "total_employees" in em
        assert "attendance_rate" in em
        assert "resumes_screened" in em

    def test_financial_metrics_structure(self):
        from graph.analytics.nodes import quickview_node
        state = {"quickview_data": None, "status": ""}
        result = quickview_node(state)
        fm = result["quickview_data"]["financial_metrics"]
        assert "total_budget" in fm
        assert "total_spent" in fm
        assert "gross_margin_pct" in fm


class TestSQLGeneratorNode:
    def test_budget_query(self):
        from graph.analytics.nodes import sql_generator_node
        state = {"user_query": "show me budget breakdown", "generated_sql": None, "visualization_type": None}
        result = sql_generator_node(state)
        assert "department_budgets" in result["generated_sql"]
        assert result["visualization_type"] == "bar"

    def test_employee_query(self):
        from graph.analytics.nodes import sql_generator_node
        state = {"user_query": "team attendance this week", "generated_sql": None, "visualization_type": None}
        result = sql_generator_node(state)
        assert "hr_attendance_records" in result["generated_sql"]
        assert result["visualization_type"] == "pie"

    def test_sales_query(self):
        from graph.analytics.nodes import sql_generator_node
        state = {"user_query": "how many sales prospects", "generated_sql": None, "visualization_type": None}
        result = sql_generator_node(state)
        assert "sales_prospects" in result["generated_sql"]

    def test_default_query(self):
        from graph.analytics.nodes import sql_generator_node
        state = {"user_query": "give me everything", "generated_sql": None, "visualization_type": None}
        result = sql_generator_node(state)
        assert "System Overview" in result["generated_sql"]
        assert result["visualization_type"] == "kpi_grid"


class TestExecutorNode:
    def test_budget_results(self):
        from graph.analytics.nodes import executor_node
        state = {"generated_sql": "SELECT * FROM department_budgets", "visualization_type": "bar",
                 "execution_results": None, "insights_summary": None}
        result = executor_node(state)
        assert len(result["execution_results"]) == 4
        assert "Engineering" in result["execution_results"][0]["department"]
        assert result["insights_summary"] is not None

    def test_attendance_results(self):
        from graph.analytics.nodes import executor_node
        state = {"generated_sql": "SELECT * FROM hr_attendance_records", "visualization_type": "pie",
                 "execution_results": None, "insights_summary": None}
        result = executor_node(state)
        assert len(result["execution_results"]) == 3

    def test_sales_results(self):
        from graph.analytics.nodes import executor_node
        state = {"generated_sql": "SELECT * FROM sales_prospects", "visualization_type": "bar",
                 "execution_results": None, "insights_summary": None}
        result = executor_node(state)
        assert any(r["deal_stage"] == "CLOSED_WON" for r in result["execution_results"])


class TestVisualizerNode:
    def test_generates_recharts_config(self):
        from graph.analytics.nodes import visualizer_node
        state = {
            "visualization_type": "bar",
            "execution_results": [{"department": "Eng", "total_budget": 100000}],
            "visualization_config": None, "status": ""
        }
        result = visualizer_node(state)
        cfg = result["visualization_config"]
        assert cfg["chart_type"] == "bar"
        assert cfg["x_axis_key"] == "department"
        assert "total_budget" in cfg["y_axis_keys"]
        assert result["status"] == "completed"


class TestDigestNode:
    def test_generates_markdown_digest(self):
        from graph.analytics.nodes import digest_node
        state = {"insights_summary": None, "status": ""}
        result = digest_node(state)
        assert "Executive" in result["insights_summary"]
        assert "AI Analytics Digest" in result["insights_summary"]
        assert result["status"] == "completed"

    def test_digest_contains_key_sections(self):
        from graph.analytics.nodes import digest_node
        state = {"insights_summary": None, "status": ""}
        result = digest_node(state)
        md = result["insights_summary"]
        assert "Human Resources" in md
        assert "Financial Operations" in md
        assert "Sales" in md
        assert "Procurement" in md
        assert "AI Token" in md
