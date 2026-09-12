"""
Test Suite — Agent 4: Procurement Agent (WhatsApp & Google Places Redesign)

Tests the Procurement Supervisor and its WhatsApp-native sub-agent stages,
including Google Places discovery, WhatsApp RFQ dispatch, quote synthesis,
and post-selection interview appointment scheduling.
"""
import sys, os, pytest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestProcurementSupervisorInit:
    def test_supervisor_initializes(self):
        from graph.procurement.supervisor import ProcurementSupervisor
        sup = ProcurementSupervisor()
        assert sup.intake_subagent is not None
        assert sup.research_subagent is not None
        assert sup.rfq_subagent is not None
        assert sup.negotiation_subagent is not None
        assert sup.interview_subagent is not None


class TestProcurementStages:
    def _make_supervisor(self):
        from graph.procurement.supervisor import ProcurementSupervisor
        sup = ProcurementSupervisor()
        # Mock all sub-agents to return predictable results
        sup.intake_subagent.process = MagicMock(return_value={"status": "ok", "specs": {"qty": 100}})
        sup.research_subagent.process = MagicMock(return_value={"status": "ok", "vendors": [{"id": "v1", "vendor_phone": "+14155552671"}]})
        sup.rfq_subagent.process = MagicMock(return_value={"status": "ok", "rfq_sent": True, "channel": "WhatsApp"})
        sup.negotiation_subagent.process = MagicMock(return_value={"status": "ok", "ranking": [{"vendor": "v1", "score": 90}]})
        sup.interview_subagent.process = MagicMock(return_value={
            "status": "ok",
            "agent_duty_complete": True,
            "appointment": {"id": "appt-123", "status": "scheduled"}
        })
        return sup

    @pytest.mark.asyncio
    async def test_intake_stage(self):
        sup = self._make_supervisor()
        result = await sup.run_stage("INTAKE", {"title": "Laptops", "description": "50 MacBooks",
                                          "budget_limit": 50000, "department": "Engineering"})
        assert result["next_stage"] == "RESEARCHED"
        assert result["active_subagent"] == "vendor_research"
        sup.intake_subagent.process.assert_called_once()

    @pytest.mark.asyncio
    async def test_research_stage(self):
        sup = self._make_supervisor()
        result = await sup.run_stage("RESEARCHED", {"title": "Laptops", "extracted_specs": {"qty": 50}})
        assert result["next_stage"] == "RFQ_DISPATCHED"
        assert result["active_subagent"] == "rfq_outreach"

    @pytest.mark.asyncio
    async def test_rfq_stage(self):
        sup = self._make_supervisor()
        result = await sup.run_stage("RFQ_DISPATCHED", {"title": "Laptops", "extracted_specs": {},
                                                   "vendors": [{"id": "v1", "vendor_phone": "+14155552671"}]})
        assert result["next_stage"] == "REPLIES_PARSED"

    @pytest.mark.asyncio
    async def test_negotiation_stage_pauses_for_hitl(self):
        sup = self._make_supervisor()
        result = await sup.run_stage("REPLIES_PARSED", {"title": "Laptops", "extracted_specs": {},
                                                   "budget_limit": 50000, "vendors": [{"id": "v1"}]})
        assert result["next_stage"] == "AWAITING_SELECTION"
        assert result["hitl_pause"] is True

    @pytest.mark.asyncio
    async def test_vendor_selection_schedules_interview(self):
        sup = self._make_supervisor()
        result = await sup.run_stage("AWAITING_SELECTION", {
            "title": "Laptops", "selected_vendor_id": "v1",
            "selection_notes": "Best price & SLA", "vendors": [{"id": "v1", "vendor_phone": "+14155552671"}]
        })
        assert result["next_stage"] == "INTERVIEW_SCHEDULED"
        assert result["active_subagent"] == "agent_duty_complete"
        assert result["agent_duty_complete"] is True
        sup.interview_subagent.process.assert_called_once()

    @pytest.mark.asyncio
    async def test_interview_scheduled_stage_duty_complete(self):
        sup = self._make_supervisor()
        result = await sup.run_stage("INTERVIEW_SCHEDULED", {
            "title": "Laptops", "department": "Eng",
            "selected_vendor": {"id": "v1", "name": "Vendor Corp"},
            "id": "proc-001"
        })
        assert result["current_stage"] == "INTERVIEW_SCHEDULED"
        assert result["active_subagent"] == "agent_duty_complete"
        assert result["agent_duty_complete"] is True

    @pytest.mark.asyncio
    async def test_unknown_stage_returns_error(self):
        sup = self._make_supervisor()
        result = await sup.run_stage("FAKE_STAGE", {"title": "Test"})
        assert result["status"] == "error"
        assert "Unknown" in result["message"]

    @pytest.mark.asyncio
    async def test_alternative_stage_names(self):
        """Supervisor accepts both pipeline-style and sub-agent-style stage names."""
        sup = self._make_supervisor()
        r1 = await sup.run_stage("intake_spec", {"title": "T"})
        assert r1["next_stage"] == "RESEARCHED"
        r2 = await sup.run_stage("vendor_research", {"title": "T", "extracted_specs": {}})
        assert r2["next_stage"] == "RFQ_DISPATCHED"

    @pytest.mark.asyncio
    async def test_full_pipeline_flow(self):
        """Run all stages sequentially to verify the full redesign pipeline."""
        sup = self._make_supervisor()
        data = {"title": "Servers", "description": "10 rack servers",
                "budget_limit": 100000, "department": "IT", "id": "proc-full"}

        r1 = await sup.run_stage("INTAKE", data)
        assert r1["next_stage"] == "RESEARCHED"

        data["extracted_specs"] = r1.get("specs", {})
        r2 = await sup.run_stage("RESEARCHED", data)
        assert r2["next_stage"] == "RFQ_DISPATCHED"

        data["vendors"] = r2.get("vendors", [{"id": "v1"}])
        r3 = await sup.run_stage("RFQ_DISPATCHED", data)
        assert r3["next_stage"] == "REPLIES_PARSED"

        r4 = await sup.run_stage("REPLIES_PARSED", data)
        assert r4["hitl_pause"] is True

        data["selected_vendor_id"] = "v1"
        r5 = await sup.run_stage("AWAITING_SELECTION", data)
        assert r5["next_stage"] == "INTERVIEW_SCHEDULED"
        assert r5["agent_duty_complete"] is True
