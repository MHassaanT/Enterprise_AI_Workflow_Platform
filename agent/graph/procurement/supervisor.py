import json
from typing import Dict, Any, List, Optional
try:
    from graph.procurement.subagents.intake_spec import IntakeSpecSubAgent
    from graph.procurement.subagents.vendor_research import VendorResearchSubAgent
    from graph.procurement.subagents.rfq_outreach import RFQOutreachSubAgent
    from graph.procurement.subagents.negotiation_synthesis import NegotiationSynthesisSubAgent
    from graph.procurement.subagents.vendor_comms import VendorCommsSubAgent
    from graph.procurement.subagents.finance_sync import FinanceSyncSubAgent
except ModuleNotFoundError:
    from agent.graph.procurement.subagents.intake_spec import IntakeSpecSubAgent
    from agent.graph.procurement.subagents.vendor_research import VendorResearchSubAgent
    from agent.graph.procurement.subagents.rfq_outreach import RFQOutreachSubAgent
    from agent.graph.procurement.subagents.negotiation_synthesis import NegotiationSynthesisSubAgent
    from agent.graph.procurement.subagents.vendor_comms import VendorCommsSubAgent
    from agent.graph.procurement.subagents.finance_sync import FinanceSyncSubAgent

class ProcurementSupervisor:
    """
    Procurement Supervisor Agent
    Orchestrates the Procurement Multi-Agent pipeline, routing requests across 6 domain sub-agents,
    managing pipeline state, and controlling Human-in-the-Loop (HITL) checkpoints.
    """

    def __init__(self):
        self.intake_subagent = IntakeSpecSubAgent()
        self.research_subagent = VendorResearchSubAgent()
        self.rfq_subagent = RFQOutreachSubAgent()
        self.negotiation_subagent = NegotiationSynthesisSubAgent()
        self.comms_subagent = VendorCommsSubAgent()
        self.finance_subagent = FinanceSyncSubAgent()

    def run_stage(self, stage: str, request_data: Dict[str, Any]) -> Dict[str, Any]:
        title = request_data.get("title", "Procurement Requirement")
        description = request_data.get("description", "")
        budget_limit = float(request_data.get("budget_limit", 0.0))
        department = request_data.get("department", "General")
        tenant_id = request_data.get("tenant_id", "00000000-0000-0000-0000-000000000000")
        procurement_id = request_data.get("id", "proc-id")

        if stage == "INTAKE" or stage == "intake_spec":
            docs_text = request_data.get("documents_text", [])
            res = self.intake_subagent.process(title, description, budget_limit, department, docs_text)
            res["next_stage"] = "RESEARCHED"
            res["active_subagent"] = "vendor_research"
            return res

        elif stage == "RESEARCHED" or stage == "vendor_research":
            specs = request_data.get("extracted_specs", {})
            res = self.research_subagent.process(title, specs, tenant_id)
            res["next_stage"] = "RFQ_DISPATCHED"
            res["active_subagent"] = "rfq_outreach"
            return res

        elif stage == "RFQ_DISPATCHED" or stage == "rfq_outreach":
            specs = request_data.get("extracted_specs", {})
            vendors = request_data.get("vendors", [])
            res = self.rfq_subagent.process(title, specs, vendors, tenant_id)
            res["next_stage"] = "REPLIES_PARSED"
            res["active_subagent"] = "negotiation_synthesis"
            return res

        elif stage == "REPLIES_PARSED" or stage == "negotiation_synthesis":
            specs = request_data.get("extracted_specs", {})
            vendors = request_data.get("vendors", [])
            res = self.negotiation_subagent.process(title, specs, budget_limit, vendors)
            res["next_stage"] = "AWAITING_SELECTION"
            res["active_subagent"] = "supervisor_hitl"
            res["hitl_pause"] = True
            return res

        elif stage == "AWAITING_SELECTION" or stage == "vendor_comms":
            selected_vendor_id = request_data.get("selected_vendor_id")
            selection_notes = request_data.get("selection_notes", "Selected after evaluation")
            vendors = request_data.get("vendors", [])
            res = self.comms_subagent.process(title, selected_vendor_id, selection_notes, vendors, tenant_id)
            res["next_stage"] = "NOTIFIED"
            res["active_subagent"] = "finance_sync"
            return res

        elif stage == "NOTIFIED" or stage == "finance_sync" or stage == "COMPLETED":
            winning_vendor = request_data.get("selected_vendor", {})
            if not winning_vendor and request_data.get("vendors"):
                winning_vendor = request_data["vendors"][0]
            res = self.finance_subagent.process(procurement_id, title, department, winning_vendor, tenant_id)
            res["next_stage"] = "COMPLETED"
            res["active_subagent"] = "completed"
            return res

        else:
            return {
                "status": "error",
                "message": f"Unknown procurement stage: {stage}"
            }
