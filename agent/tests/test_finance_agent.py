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
        assert "payment intelligence" in result["data"]["summary"].lower() or "summary" in result["data"]

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

    @pytest.mark.asyncio
    async def test_get_budget_task(self):
        from unittest.mock import patch, AsyncMock
        from routers.finance_agent import run_finance_task, FinanceTaskRequest

        mock_req = MagicMock()
        mock_req.headers = {}
        request = FinanceTaskRequest(task_type="get_budget", tenant_id="t123", payload={})

        with patch("routers.finance_agent.execute_db_query", new_callable=AsyncMock) as mock_db:
            mock_db.return_value = {"rows": [{"department": "Engineering", "budget_amount": 100000}]}
            result = await run_finance_task(request, mock_req)
            assert result["status"] == "success"
            assert len(result["data"]["budgets"]) == 1
            assert result["data"]["budgets"][0]["department"] == "Engineering"


class TestFinanceBudgetEndpoints:
    @pytest.mark.asyncio
    async def test_get_budget_endpoint(self):
        from unittest.mock import patch, AsyncMock
        from routers.finance_agent import get_budget

        mock_req = MagicMock()
        mock_req.headers = {"x-tenant-id": "t-test-1"}

        with patch("routers.finance_agent.execute_db_query", new_callable=AsyncMock) as mock_db:
            mock_db.return_value = {"rows": [{"department": "Sales", "budget_amount": 75000}]}
            res = await get_budget(mock_req)
            assert res["success"] is True
            assert "budgets" in res
            assert "budget" in res
            assert res["budgets"][0]["department"] == "Sales"

    @pytest.mark.asyncio
    async def test_save_budget_endpoint(self):
        from unittest.mock import patch, AsyncMock
        from routers.finance_agent import save_budget, BudgetUpdateRequest

        mock_req = MagicMock()
        mock_req.headers = {"x-tenant-id": "t-test-1"}
        mock_req.json = AsyncMock(return_value={"budgets": [{"department": "IT", "budget_amount": 50000}]})

        with patch("routers.finance_agent.execute_db_query", new_callable=AsyncMock) as mock_db:
            mock_db.return_value = {"rows": []}
            res = await save_budget(mock_req)
            assert res["success"] is True
            assert "saved" in res["message"]


class TestPaymentIntelligenceEndpoints:
    @pytest.mark.asyncio
    async def test_get_finance_status(self):
        from unittest.mock import patch, AsyncMock
        from routers.finance_agent import get_finance_status

        mock_req = MagicMock()
        mock_req.headers = {"x-tenant-id": "t-payment-1"}

        with patch("services.finance_service.get_payment_integrations_status", new_callable=AsyncMock) as mock_status:
            mock_status.return_value = {
                "stripe": {"connected": True, "tool_id": "stripe-123"},
                "safepay": {"connected": True, "tool_id": "safepay-456"},
            }
            res = await get_finance_status(mock_req)
            assert res["success"] is True
            assert res["status"]["stripe"]["connected"] is True
            assert res["status"]["safepay"]["connected"] is True

    @pytest.mark.asyncio
    async def test_get_finance_overview(self):
        from unittest.mock import patch, AsyncMock
        from routers.finance_agent import get_finance_overview

        mock_req = MagicMock()
        mock_req.headers = {"x-tenant-id": "t-payment-1"}

        with patch("services.finance_service.fetch_unified_finance_overview", new_callable=AsyncMock) as mock_ov:
            mock_ov.return_value = {
                "view_mode": "all",
                "summary": {
                    "gross_volume_usd": 48500.0,
                    "net_volume_usd": 45600.0,
                    "refunds_volume_usd": 1250.0,
                    "success_rate": 98.3,
                },
                "charts": {"timeline": [], "distribution": []},
                "transactions": [],
            }
            res = await get_finance_overview(mock_req, provider="all", period_days=30)
            assert res["success"] is True
            assert res["data"]["summary"]["gross_volume_usd"] == 48500.0
            assert res["data"]["summary"]["success_rate"] == 98.3

    @pytest.mark.asyncio
    async def test_get_finance_transactions(self):
        from unittest.mock import patch, AsyncMock
        from routers.finance_agent import get_finance_transactions

        mock_req = MagicMock()
        mock_req.headers = {"x-tenant-id": "t-payment-1"}

        with patch("services.finance_service.fetch_unified_finance_overview", new_callable=AsyncMock) as mock_ov:
            mock_ov.return_value = {
                "transactions": [
                    {"id": "tx_1", "provider": "stripe", "status": "succeeded", "customer_name": "Alice Inc"},
                    {"id": "tx_2", "provider": "safepay", "status": "succeeded", "customer_name": "Bob LLC"},
                    {"id": "tx_3", "provider": "stripe", "status": "failed", "customer_name": "Charlie Corp"},
                ]
            }
            # Test status filtering
            res = await get_finance_transactions(mock_req, provider="all", status="succeeded")
            assert res["success"] is True
            assert res["count"] == 2
            assert all(t["status"] == "succeeded" for t in res["transactions"])

            # Test search filtering
            res_search = await get_finance_transactions(mock_req, search="Bob")
            assert res_search["count"] == 1
            assert res_search["transactions"][0]["customer_name"] == "Bob LLC"

    @pytest.mark.asyncio
    async def test_get_financial_insights(self):
        from unittest.mock import patch, AsyncMock
        from routers.finance_agent import get_financial_insights

        mock_req = MagicMock()
        mock_req.headers = {"x-tenant-id": "t-payment-1"}

        with patch("services.finance_service.fetch_unified_finance_overview", new_callable=AsyncMock) as mock_ov, \
             patch("services.finance_service.generate_ai_financial_insights", new_callable=AsyncMock) as mock_insights:
            mock_ov.return_value = {"summary": {"gross_volume_usd": 50000.0}}
            mock_insights.return_value = {
                "success": True,
                "insights_markdown": "### Executive Briefing\nHealthy cashflow.",
            }
            res = await get_financial_insights(mock_req)
            assert res["success"] is True
            assert "Executive Briefing" in res["insights"]["insights_markdown"]


class TestFinancePaymentAdapters:
    @pytest.mark.asyncio
    async def test_stripe_overview_sandbox_generation(self):
        from tool_gateway.adapters.stripe_adapter import stripe_get_financial_overview
        data = await stripe_get_financial_overview({}, period_days=14)
        assert data["provider"] == "stripe"
        assert data["connected"] is True
        assert "metrics" in data
        assert data["metrics"]["gross_volume"] > 0
        assert len(data["timeline"]) == 14
        assert len(data["transactions"]) > 0

    @pytest.mark.asyncio
    async def test_safepay_overview_sandbox_generation(self):
        from tool_gateway.adapters.safepay_adapter import safepay_get_financial_overview
        data = await safepay_get_financial_overview({}, period_days=14)
        assert data["provider"] == "safepay"
        assert data["connected"] is True
        assert "metrics" in data
        assert data["metrics"]["gross_volume_pkr"] > 0
        assert data["metrics"]["gross_volume_usd"] > 0
        assert len(data["timeline"]) == 14
        assert len(data["transactions"]) > 0


