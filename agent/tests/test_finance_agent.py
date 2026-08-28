"""
Test Suite — Agent 5: Finance Agent

Tests the Finance Agent FastAPI router.
"""
import sys, os, pytest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestFinanceModels:
    def test_finance_task_request(self):
        from routers.finance_agent import FinanceTaskRequest
        r = FinanceTaskRequest(task_type="generate_summary", tenant_id="t", payload={"month": "Jan"})
        assert r.task_type == "generate_summary"
        assert r.payload["month"] == "Jan"

    def test_finance_task_request_empty_payload(self):
        from routers.finance_agent import FinanceTaskRequest
        r = FinanceTaskRequest(task_type="custom", tenant_id="t", payload={})
        assert r.payload == {}


class TestFinanceRunTask:
    @pytest.mark.asyncio
    async def test_generate_summary_returns_success(self):
        from routers.finance_agent import run_finance_task, FinanceTaskRequest

        request = FinanceTaskRequest(task_type="generate_summary", tenant_id="t", payload={})
        mock_req = MagicMock()
        mock_req.headers = {"x-internal-token": "internal_secret_change_in_production"}

        result = await run_finance_task(request, mock_req)
        assert result["status"] == "success"
        assert "summary" in result["data"]
        assert "normal parameters" in result["data"]["summary"]

    @pytest.mark.asyncio
    async def test_unknown_task_type_acknowledged(self):
        from routers.finance_agent import run_finance_task, FinanceTaskRequest

        request = FinanceTaskRequest(task_type="anomaly_detection", tenant_id="t", payload={})
        mock_req = MagicMock()
        mock_req.headers = {"x-internal-token": "internal_secret_change_in_production"}

        result = await run_finance_task(request, mock_req)
        assert result["status"] == "success"
        assert "anomaly_detection" in result["message"]

    @pytest.mark.asyncio
    async def test_various_task_types(self):
        from routers.finance_agent import run_finance_task, FinanceTaskRequest
        mock_req = MagicMock()
        mock_req.headers = {}

        for task_type in ["forecast", "reconcile", "audit", "budget_alert"]:
            request = FinanceTaskRequest(task_type=task_type, tenant_id="t", payload={})
            result = await run_finance_task(request, mock_req)
            assert result["status"] == "success"
            assert task_type in result["message"]
