"""
Test Suite — Agent 4: Procurement Agent

Tests the Procurement Supervisor and its 6 sub-agent stages.
"""
import sys, os, pytest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestProcurementSupervisorInit:
    def test_supervisor_initializes(self):
        from graph.procurement.supervisor import ProcurementSupervisor
        sup = ProcurementSupervisor()
        assert sup.intake_subagent is not None
        assert sup.research_subagent is not None
        assert sup.rfq_subagent is not None
        assert sup.negotiation_subagent is not None
        assert sup.comms_subagent is not None
        assert sup.finance_subagent is not None


class TestProcurementStages:
    def _make_supervisor(self):
        from graph.procurement.supervisor import ProcurementSupervisor
        sup = ProcurementSupervisor()
        # Mock all sub-agents to return predictable results
        sup.intake_subagent.process = MagicMock(return_value={"status": "ok", "specs": {"qty": 100}})
        sup.research_subagent.process = MagicMock(return_value={"status": "ok", "vendors": [{"id": "v1"}]})
        sup.rfq_subagent.process = MagicMock(return_value={"status": "ok", "rfq_sent": True})
        sup.negotiation_subagent.process = MagicMock(return_value={"status": "ok", "ranking": [{"vendor": "v1", "score": 90}]})
        sup.comms_subagent.process = MagicMock(return_value={"status": "ok", "notified": True})
        sup.finance_subagent.process = MagicMock(return_value={"status": "ok", "synced": True})
        return sup

    def test_intake_stage(self):
        sup = self._make_supervisor()
        result = sup.run_stage("INTAKE", {"title": "Laptops", "description": "50 MacBooks",
                                          "budget_limit": 50000, "department": "Engineering"})
        assert result["next_stage"] == "RESEARCHED"
        assert result["active_subagent"] == "vendor_research"
        sup.intake_subagent.process.assert_called_once()

    def test_research_stage(self):
        sup = self._make_supervisor()
        result = sup.run_stage("RESEARCHED", {"title": "Laptops", "extracted_specs": {"qty": 50}})
        assert result["next_stage"] == "RFQ_DISPATCHED"
        assert result["active_subagent"] == "rfq_outreach"

    def test_rfq_stage(self):
        sup = self._make_supervisor()
        result = sup.run_stage("RFQ_DISPATCHED", {"title": "Laptops", "extracted_specs": {},
                                                   "vendors": [{"id": "v1"}]})
        assert result["next_stage"] == "REPLIES_PARSED"

    def test_negotiation_stage_pauses_for_hitl(self):
        sup = self._make_supervisor()
        result = sup.run_stage("REPLIES_PARSED", {"title": "Laptops", "extracted_specs": {},
                                                   "budget_limit": 50000, "vendors": [{"id": "v1"}]})
        assert result["next_stage"] == "AWAITING_SELECTION"
        assert result["hitl_pause"] is True

    def test_vendor_selection_stage(self):
        sup = self._make_supervisor()
        result = sup.run_stage("AWAITING_SELECTION", {
            "title": "Laptops", "selected_vendor_id": "v1",
            "selection_notes": "Best price", "vendors": [{"id": "v1"}]
        })
        assert result["next_stage"] == "NOTIFIED"
        assert result["active_subagent"] == "finance_sync"

    def test_finance_sync_stage(self):
        sup = self._make_supervisor()
        result = sup.run_stage("NOTIFIED", {
            "title": "Laptops", "department": "Eng",
            "selected_vendor": {"id": "v1", "name": "Vendor Corp"},
            "id": "proc-001"
        })
        assert result["next_stage"] == "COMPLETED"
        assert result["active_subagent"] == "completed"

    def test_completed_stage_aliases(self):
        sup = self._make_supervisor()
        result = sup.run_stage("COMPLETED", {
            "title": "Laptops", "department": "Eng",
            "selected_vendor": {"id": "v1"}, "id": "proc-002"
        })
        assert result["next_stage"] == "COMPLETED"

    def test_unknown_stage_returns_error(self):
        sup = self._make_supervisor()
        result = sup.run_stage("FAKE_STAGE", {"title": "Test"})
        assert result["status"] == "error"
        assert "Unknown" in result["message"]

    def test_alternative_stage_names(self):
        """Supervisor accepts both pipeline-style and sub-agent-style stage names."""
        sup = self._make_supervisor()
        r1 = sup.run_stage("intake_spec", {"title": "T"})
        assert r1["next_stage"] == "RESEARCHED"
        r2 = sup.run_stage("vendor_research", {"title": "T", "extracted_specs": {}})
        assert r2["next_stage"] == "RFQ_DISPATCHED"

    def test_full_pipeline_flow(self):
        """Run all stages sequentially to verify the full pipeline."""
        sup = self._make_supervisor()
        data = {"title": "Servers", "description": "10 rack servers",
                "budget_limit": 100000, "department": "IT", "id": "proc-full"}

        r1 = sup.run_stage("INTAKE", data)
        assert r1["next_stage"] == "RESEARCHED"

        data["extracted_specs"] = r1.get("specs", {})
        r2 = sup.run_stage("RESEARCHED", data)
        assert r2["next_stage"] == "RFQ_DISPATCHED"

        data["vendors"] = r2.get("vendors", [{"id": "v1"}])
        r3 = sup.run_stage("RFQ_DISPATCHED", data)
        assert r3["next_stage"] == "REPLIES_PARSED"

        r4 = sup.run_stage("REPLIES_PARSED", data)
        assert r4["hitl_pause"] is True

        data["selected_vendor_id"] = "v1"
        r5 = sup.run_stage("AWAITING_SELECTION", data)
        assert r5["next_stage"] == "NOTIFIED"

        data["selected_vendor"] = {"id": "v1", "name": "BestVendor"}
        r6 = sup.run_stage("NOTIFIED", data)
        assert r6["next_stage"] == "COMPLETED"
