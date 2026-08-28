"""
Test Suite — Agent 2: Sales SDR Agent

Tests graph structure, UUID normalization, Pydantic models, stub endpoints, and run status tracking.
"""
import sys, os, pytest
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestSalesGraphStructure:
    def test_graph_compiles(self):
        from graph.sales.graph import sales_head_graph
        assert sales_head_graph is not None

    def test_graph_has_six_nodes(self):
        from graph.sales.graph import build_sales_sdr_graph
        graph = build_sales_sdr_graph()
        node_names = set(graph.get_graph().nodes.keys())
        expected = {"business_understanding", "account_fit_research", "contact_discovery",
                    "deliverability_guard", "scoring_copy_gen", "dispatch_closing"}
        assert expected.issubset(node_names)


class TestNormalizeUUID:
    def test_valid_uuid(self):
        from routers.sales_agent import _normalize_uuid
        v = "550e8400-e29b-41d4-a716-446655440000"
        assert _normalize_uuid(v) == v

    def test_invalid_uuid(self):
        from routers.sales_agent import _normalize_uuid
        assert _normalize_uuid("bad") == "00000000-0000-0000-0000-000000000000"

    def test_none(self):
        from routers.sales_agent import _normalize_uuid
        assert _normalize_uuid(None) == "00000000-0000-0000-0000-000000000000"

    def test_empty(self):
        from routers.sales_agent import _normalize_uuid
        assert _normalize_uuid("") == "00000000-0000-0000-0000-000000000000"

    def test_uuid_without_dashes(self):
        from routers.sales_agent import _normalize_uuid
        assert _normalize_uuid("550e8400e29b41d4a716446655440000") == "550e8400-e29b-41d4-a716-446655440000"


class TestSalesModels:
    def test_pipeline_run_defaults(self):
        from routers.sales_agent import SalesPipelineRunRequest
        r = SalesPipelineRunRequest(tenant_id="t")
        assert r.prospect_limit == 10 and r.auto_send_email is False and r.user_id == "sales_sdr"

    def test_icp_config_defaults(self):
        from routers.sales_agent import ICPConfigRequest
        r = ICPConfigRequest(tenant_id="t")
        assert r.target_industries == [] and r.company_size_min == 10

    def test_single_email_send(self):
        from routers.sales_agent import SingleEmailSendRequest
        r = SingleEmailSendRequest(tenant_id="t", contact_email="a@b.com", subject="S", body="B")
        assert r.prospect_id is None

    def test_check_replies_request(self):
        from routers.sales_agent import CheckRepliesRequest
        r = CheckRepliesRequest(tenant_id="t", simulate_reply=True, simulated_text="Hi")
        assert r.simulate_reply is True

    def test_draft_proposal_defaults(self):
        from routers.sales_agent import DraftProposalRequest
        r = DraftProposalRequest(tenant_id="t", prospect_id="p")
        assert r.pricing_tier == "Enterprise"

    def test_confirm_sale_defaults(self):
        from routers.sales_agent import ConfirmSaleRequest
        r = ConfirmSaleRequest(tenant_id="t", prospect_id="p")
        assert r.final_deal_value == 50000.00


class TestSalesRouterStubs:
    @pytest.mark.asyncio
    async def test_hunter_key_save(self):
        from routers.sales_agent import save_hunter_key
        assert (await save_hunter_key())["success"] is True

    @pytest.mark.asyncio
    async def test_hunter_key_status(self):
        from routers.sales_agent import get_hunter_key_status
        assert (await get_hunter_key_status("t"))["configured"] is True

    def test_date_now_id(self):
        from routers.sales_agent import Date_now_id
        assert isinstance(Date_now_id(), int) and Date_now_id() > 0


class TestSalesRunStatus:
    @pytest.mark.asyncio
    async def test_unknown_run_id_404(self):
        from routers.sales_agent import get_sales_run_status
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as e:
            await get_sales_run_status("nope", x_internal_token="internal_secret_change_in_production")
        assert e.value.status_code == 404

    @pytest.mark.asyncio
    async def test_wrong_token_401(self):
        from routers.sales_agent import get_sales_run_status
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as e:
            await get_sales_run_status("x", x_internal_token="wrong")
        assert e.value.status_code == 401

    @pytest.mark.asyncio
    async def test_manual_status_tracking(self):
        from routers.sales_agent import RUN_STATUSES, get_sales_run_status
        RUN_STATUSES["test-run"] = {"status": "COMPLETED", "processed_count": 5, "logs": [], "result": {"ok": True}}
        try:
            r = await get_sales_run_status("test-run", x_internal_token="internal_secret_change_in_production")
            assert r["status"] == "COMPLETED" and r["processed_count"] == 5
        finally:
            del RUN_STATUSES["test-run"]
