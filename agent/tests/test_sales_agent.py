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

    @pytest.mark.asyncio
    async def test_search_company_phone_serper(self):
        from tool_gateway.search_discovery import search_company_phone
        with patch("tool_gateway.search_discovery._get_serper_api_key", new_callable=AsyncMock, return_value="mock-key"):
            with patch("tool_gateway.search_discovery._execute_serper_search", new_callable=AsyncMock) as mock_serp:
                # Test knowledgeGraph phone extraction
                mock_serp.return_value = {
                    "knowledgeGraph": {"phone": "+1 415 555 2671"}
                }
                phone = await search_company_phone("Acme Corp", "acme.com", "t1")
                assert phone == "+14155552671"

                # Test organic snippet regex phone extraction fallback
                mock_serp.return_value = {
                    "organic": [{"snippet": "Call Acme headquarters at (800) 555-0199 for sales inquiries."}]
                }
                phone2 = await search_company_phone("Acme Corp", "acme.com", "t1")
                assert phone2 == "+18005550199"

    @pytest.mark.asyncio
    async def test_scoring_copy_gen_whatsapp(self):
        from graph.sales.nodes.scoring_copy_gen import scoring_copy_gen_node
        with patch("graph.sales.nodes.scoring_copy_gen.get_tenant_company_context", new_callable=AsyncMock) as mock_ctx:
            mock_ctx.return_value = {
                "company_name": "Antigravity AI",
                "sender_name": "Sarah Connor",
                "sender_role": "Sales Lead",
                "description": "Enterprise AI Orchestration"
            }
            state = {
                "tenant_id": "00000000-0000-0000-0000-000000000000",
                "outreach_channel": "whatsapp",
                "icp_config": {"target_titles": ["VP of Sales"], "target_industries": ["Software"]},
                "verified_contacts": [{
                    "company_name": "Target Tech",
                    "domain": "targettech.io",
                    "contact_name": "John Doe",
                    "contact_title": "VP of Sales",
                    "contact_phone": "+15551234567",
                    "whatsapp_status": "ON_WHATSAPP",
                    "deliverability": {"is_valid": True, "status": "DELIVERABLE"}
                }],
                "scraped_accounts": [],
                "logs": []
            }
            res = await scoring_copy_gen_node(state)
            assert len(res["outreach_batch"]) == 1
            batch_item = res["outreach_batch"][0]
            assert batch_item["whatsapp_status"] == "ON_WHATSAPP"
            assert batch_item["outreach_channel"] == "whatsapp"
            assert "John" in batch_item["body"]
            assert batch_item["icp_score"] >= 70.0

    @pytest.mark.asyncio
    async def test_dispatch_closing_whatsapp_preserves_discovered(self):
        from graph.sales.nodes.dispatch_closing import dispatch_closing_node
        with patch("graph.sales.nodes.dispatch_closing.execute_db_query", new_callable=AsyncMock) as mock_db:
            mock_db.return_value = {"rows": []}
            state = {
                "tenant_id": "00000000-0000-0000-0000-000000000000",
                "outreach_channel": "whatsapp",
                "auto_send_email": False,
                "outreach_batch": [{
                    "company_name": "Target Tech",
                    "domain": "targettech.io",
                    "contact_name": "John Doe",
                    "contact_title": "VP of Sales",
                    "contact_email": "john@targettech.io",
                    "contact_phone": "+15551234567",
                    "whatsapp_status": "ON_WHATSAPP",
                    "outreach_channel": "whatsapp",
                    "hunter_person_id": "H1",
                    "apollo_person_id": "A1",
                    "deliverability_status": "VALID",
                    "icp_score": 92.0,
                    "subject": "WhatsApp Outreach",
                    "body": "Hi John, let's connect on WhatsApp.",
                    "quote_details": {},
                    "scraped_text": ""
                }],
                "logs": []
            }
            res = await dispatch_closing_node(state)
            assert res["processed_count"] == 1
            assert res["deal_stage"] == "DISCOVERED"
            assert res["whatsapp_status"] == "ON_WHATSAPP"
            assert res["outreach_sent"] is False
            assert "Target Tech" in res["answer"]
            assert "+15551234567" in res["answer"]

    @pytest.mark.asyncio
    async def test_full_sales_graph_whatsapp_pipeline(self):
        from graph.sales.graph import sales_head_graph
        with patch("graph.sales.nodes.business_understanding.search_company_accounts", new_callable=AsyncMock) as mock_accts, \
             patch("graph.sales.nodes.contact_discovery.search_contact_person", new_callable=AsyncMock) as mock_person, \
             patch("graph.sales.nodes.contact_discovery.search_company_phone", new_callable=AsyncMock) as mock_phone, \
             patch("graph.sales.nodes.deliverability_guard.verify_email", new_callable=AsyncMock) as mock_email, \
             patch("graph.sales.nodes.deliverability_guard.check_whatsapp_registration", new_callable=AsyncMock) as mock_wa, \
             patch("graph.sales.nodes.scoring_copy_gen.get_tenant_company_context", new_callable=AsyncMock) as mock_ctx, \
             patch("graph.sales.nodes.dispatch_closing.execute_db_query", new_callable=AsyncMock) as mock_db:

            mock_ctx.return_value = {"company_name": "Antigravity AI", "sender_name": "Alex", "sender_role": "SDR"}
            mock_accts.return_value = {
                "accounts": [{
                    "domain": "fintechprime.com",
                    "company_name": "Fintech Prime",
                    "industry": "Fintech",
                    "search_snippet": "Fintech Prime API solutions"
                }],
                "total_found": 1
            }
            mock_person.return_value = {
                "status": "found",
                "contact": {
                    "name": "David Miller",
                    "first_name": "David",
                    "last_name": "Miller",
                    "title": "CTO",
                    "phone": None
                }
            }
            mock_phone.return_value = "+14155558899"
            mock_email.return_value = {"is_valid": True, "status": "DELIVERABLE"}
            mock_wa.return_value = {
                "is_registered": True,
                "whatsapp_status": "ON_WHATSAPP",
                "jid": "14155558899@s.whatsapp.net"
            }
            mock_db.return_value = {"rows": []}

            initial_state = {
                "tenant_id": "00000000-0000-0000-0000-000000000000",
                "outreach_channel": "whatsapp",
                "auto_send_email": False,
                "prospect_limit": 5,
                "logs": []
            }

            final_state = await sales_head_graph.ainvoke(
                initial_state,
                config={"configurable": {"thread_id": "test-sales-thread"}}
            )

            assert final_state["processed_count"] == 1
            assert final_state["deal_stage"] == "DISCOVERED"
            assert final_state["whatsapp_status"] == "ON_WHATSAPP"
            assert final_state["outreach_channel"] == "whatsapp"
            assert final_state["outreach_sent"] is False
            contact = final_state["discovered_contact"]
            assert contact["contact_name"] == "David Miller"
            assert contact["contact_phone"] == "+14155558899"
            assert contact["whatsapp_status"] == "ON_WHATSAPP"
            assert "Fintech Prime" in final_state["answer"]





