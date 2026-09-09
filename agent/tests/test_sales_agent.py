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


class TestSalesWhatsAppIntegration:
    def test_whatsapp_request_models(self):
        from routers.sales_agent import (
            SingleWhatsAppSendRequest,
            SalesPipelineRunRequest,
            CheckRepliesRequest,
            SendReplyRequest,
            SendProposalRequest
        )
        # SingleWhatsAppSendRequest
        wa_req = SingleWhatsAppSendRequest(
            tenant_id="t1",
            contact_phone="+15551234567",
            message="Hi from WhatsApp SDR!"
        )
        assert wa_req.contact_phone == "+15551234567"
        assert wa_req.message == "Hi from WhatsApp SDR!"

        # SalesPipelineRunRequest with channel
        run_req = SalesPipelineRunRequest(
            tenant_id="t1",
            outreach_channel="whatsapp"
        )
        assert run_req.outreach_channel == "whatsapp"

        # CheckRepliesRequest with channel
        rep_req = CheckRepliesRequest(tenant_id="t1", channel="whatsapp")
        assert rep_req.channel == "whatsapp"

        # SendReplyRequest with channel
        send_rep = SendReplyRequest(tenant_id="t1", prospect_id="p1", reply_text="Thanks!", channel="whatsapp")
        assert send_rep.channel == "whatsapp"

        # SendProposalRequest with channel
        prop_req = SendProposalRequest(tenant_id="t1", prospect_id="p1", channel="whatsapp")
        assert prop_req.channel == "whatsapp"

    def test_phone_normalization(self):
        from tool_gateway.search_discovery import normalize_e164_phone
        assert normalize_e164_phone("+1 (555) 123-4567") == "+15551234567"
        assert normalize_e164_phone("+44 20 7946 0958") == "+442079460958"
        assert normalize_e164_phone("15551234567") == "+15551234567"
        assert normalize_e164_phone("442079460958") == "+442079460958"
        assert normalize_e164_phone("123") is None
        assert normalize_e164_phone("") is None
        assert normalize_e164_phone(None) is None

    @pytest.mark.asyncio
    async def test_whatsapp_verifier_service(self):
        from services.whatsapp_verifier import check_whatsapp_registration
        with patch("httpx.AsyncClient.post") as mock_post:
            mock_post.return_value = AsyncMock(
                status_code=200,
                json=lambda: {"results": [{"exists": True, "jid": "15551234567@s.whatsapp.net"}]}
            )
            res = await check_whatsapp_registration("+15551234567", tenant_id="t1")
            assert res["is_registered"] is True
            assert res["whatsapp_status"] == "ON_WHATSAPP"
            assert "15551234567" in res["jid"]

    @pytest.mark.asyncio
    async def test_whatsapp_verifier_not_registered(self):
        from services.whatsapp_verifier import check_whatsapp_registration
        with patch("httpx.AsyncClient.post") as mock_post:
            mock_post.return_value = AsyncMock(
                status_code=200,
                json=lambda: {"results": [{"exists": False}]}
            )
            res = await check_whatsapp_registration("+15559999999", tenant_id="t1")
            assert res["is_registered"] is False
            assert res["whatsapp_status"] == "NOT_ON_WHATSAPP"

    @pytest.mark.asyncio
    async def test_deliverability_guard_whatsapp_channel_filter(self):
        from graph.sales.nodes.deliverability_guard import deliverability_guard_node

        # Mock email verifier as deliverable
        with patch("graph.sales.nodes.deliverability_guard.verify_email", new_callable=AsyncMock) as mock_email:
            mock_email.return_value = {"is_valid": True, "status": "DELIVERABLE"}

            # Prospect A has registered WhatsApp, Prospect B does not
            with patch("graph.sales.nodes.deliverability_guard.check_whatsapp_registration", new_callable=AsyncMock) as mock_wa:
                async def mock_wa_check(phone, tenant_id=None):
                    if phone == "+15551111111":
                        return {"is_registered": True, "whatsapp_status": "ON_WHATSAPP", "status": "ON_WHATSAPP", "jid": "15551111111@s.whatsapp.net"}
                    return {"is_registered": False, "whatsapp_status": "NOT_ON_WHATSAPP", "status": "NOT_ON_WHATSAPP", "jid": None}
                mock_wa.side_effect = mock_wa_check

                state = {
                    "tenant_id": "00000000-0000-0000-0000-000000000000",
                    "outreach_channel": "whatsapp",
                    "discovered_contacts": [
                        {
                            "company_name": "Valid WA Corp",
                            "domain": "validwa.com",
                            "contact_name": "Alice Valid",
                            "contact_email": "alice@validwa.com",
                            "contact_phone": "+15551111111",
                            "whatsapp_status": "UNVERIFIED"
                        },
                        {
                            "company_name": "Invalid WA Corp",
                            "domain": "invalidwa.com",
                            "contact_name": "Bob Invalid",
                            "contact_email": "bob@invalidwa.com",
                            "contact_phone": "+15552222222",
                            "whatsapp_status": "UNVERIFIED"
                        }
                    ],
                    "logs": []
                }

                result = await deliverability_guard_node(state)
                verified = result.get("verified_contacts", [])
                assert len(verified) == 1
                assert verified[0]["contact_name"] == "Alice Valid"
                assert verified[0]["whatsapp_status"] == "ON_WHATSAPP"


