import inspect
import json
from typing import Dict, Any, List, Optional
try:
    from graph.procurement.subagents.intake_spec import IntakeSpecSubAgent
    from graph.procurement.subagents.vendor_research import VendorResearchSubAgent
    from graph.procurement.subagents.rfq_outreach import RFQOutreachSubAgent
    from graph.procurement.subagents.negotiation_synthesis import NegotiationSynthesisSubAgent
    from graph.procurement.subagents.interview_scheduler import InterviewSchedulerSubAgent
    from graph.procurement.subagents.vendor_comms import VendorCommsSubAgent
    from graph.procurement.subagents.finance_sync import FinanceSyncSubAgent
except ModuleNotFoundError:
    from agent.graph.procurement.subagents.intake_spec import IntakeSpecSubAgent
    from agent.graph.procurement.subagents.vendor_research import VendorResearchSubAgent
    from agent.graph.procurement.subagents.rfq_outreach import RFQOutreachSubAgent
    from agent.graph.procurement.subagents.negotiation_synthesis import NegotiationSynthesisSubAgent
    from agent.graph.procurement.subagents.interview_scheduler import InterviewSchedulerSubAgent
    from agent.graph.procurement.subagents.vendor_comms import VendorCommsSubAgent
    from agent.graph.procurement.subagents.finance_sync import FinanceSyncSubAgent


async def _maybe_await(res):
    """Helper that awaits coroutines or returns values directly if synchronous/mocked."""
    if inspect.isawaitable(res):
        return await res
    return res


class ProcurementSupervisor:
    """
    Procurement Supervisor Agent
    Orchestrates the WhatsApp-native Procurement Multi-Agent pipeline:
    1. Ingestion & Specification Extraction (intake_spec)
    2. Google Places API Vendor Discovery (vendor_research)
    3. WhatsApp RFQ Outreach (rfq_outreach)
    4. Quote Synthesis & Comparison Matrix (negotiation_synthesis)
    5. Human-in-the-Loop Selection Gate
    6. WhatsApp Interview Request & Appointment Scheduling (interview_scheduler)
    7. Concludes agent duties upon appointment booking — human representative conducts interview and final contracting.
    """

    def __init__(self):
        self.intake_subagent = IntakeSpecSubAgent()
        self.research_subagent = VendorResearchSubAgent()
        self.rfq_subagent = RFQOutreachSubAgent()
        self.negotiation_subagent = NegotiationSynthesisSubAgent()
        self.interview_subagent = InterviewSchedulerSubAgent()
        # Keep legacy subagent references for backwards compatibility
        self.comms_subagent = VendorCommsSubAgent()
        self.finance_subagent = FinanceSyncSubAgent()

    async def run_stage(self, stage: str, request_data: Dict[str, Any]) -> Dict[str, Any]:
        title = request_data.get("title", "Procurement Requirement")
        description = request_data.get("description", "")
        budget_limit = float(request_data.get("budget_limit", 0.0))
        department = request_data.get("department", "General")
        tenant_id = request_data.get("tenant_id", "00000000-0000-0000-0000-000000000000")
        procurement_id = request_data.get("id", "proc-id")

        if stage in ["INTAKE", "intake_spec"]:
            docs_text = request_data.get("documents_text", [])
            res = await _maybe_await(self.intake_subagent.process(title, description, budget_limit, department, docs_text))
            res["next_stage"] = "RESEARCHED"
            res["active_subagent"] = "vendor_research"
            return res

        elif stage in ["RESEARCHED", "vendor_research"]:
            specs = request_data.get("extracted_specs", {})
            res = await _maybe_await(self.research_subagent.process(title, specs, tenant_id))
            res["next_stage"] = "RFQ_DISPATCHED"
            res["active_subagent"] = "rfq_outreach"
            return res

        elif stage in ["RFQ_DISPATCHED", "rfq_outreach"]:
            specs = request_data.get("extracted_specs", {})
            vendors = request_data.get("vendors", [])
            auto_send = bool(request_data.get("auto_send_whatsapp", True))
            res = await _maybe_await(self.rfq_subagent.process(title, specs, vendors, tenant_id, auto_send_whatsapp=auto_send))
            res["next_stage"] = "REPLIES_PARSED"
            res["active_subagent"] = "negotiation_synthesis"
            return res

        elif stage in ["REPLIES_PARSED", "negotiation_synthesis"]:
            specs = request_data.get("extracted_specs", {})
            vendors = request_data.get("vendors", [])
            res = await _maybe_await(self.negotiation_subagent.process(title, specs, budget_limit, vendors))
            res["next_stage"] = "AWAITING_SELECTION"
            res["active_subagent"] = "supervisor_hitl"
            res["hitl_pause"] = True
            return res

        elif stage in ["AWAITING_SELECTION", "interview_scheduler", "select-vendor", "schedule_interview"]:
            selected_vendor_id = request_data.get("selected_vendor_id")
            selection_notes = request_data.get("selection_notes", "Selected for representative interview")
            vendors = request_data.get("vendors", [])
            preferred_date = request_data.get("preferred_date")
            preferred_time = request_data.get("preferred_time")

            # Route to Interview Scheduler Sub-Agent
            res = await _maybe_await(self.interview_subagent.process(
                title=title,
                department=department,
                selected_vendor_id=selected_vendor_id,
                selection_notes=selection_notes,
                vendors=vendors,
                tenant_id=tenant_id,
                preferred_date=preferred_date,
                preferred_time=preferred_time
            ))
            res["next_stage"] = "INTERVIEW_SCHEDULED"
            res["active_subagent"] = "agent_duty_complete"
            res["agent_duty_complete"] = True
            return res

        elif stage in ["INTERVIEW_SCHEDULED", "COMPLETED", "completed"]:
            return {
                "status": "success",
                "current_stage": "INTERVIEW_SCHEDULED",
                "active_subagent": "agent_duty_complete",
                "agent_duty_complete": True,
                "message": (
                    "Agent duties are finished. The vendor interview appointment has been registered "
                    "in the Appointments system. The human company representative will conduct the interview "
                    "and handle final purchasing decisions manually."
                )
            }

        # Backwards compatible alias for old tests
        elif stage == "NOTIFIED":
            # Map legacy NOTIFIED directly to interview scheduler completion
            winning_vendor = request_data.get("selected_vendor", {})
            return {
                "status": "success",
                "next_stage": "INTERVIEW_SCHEDULED",
                "active_subagent": "agent_duty_complete",
                "agent_duty_complete": True,
                "selected_vendor": winning_vendor
            }

        else:
            return {
                "status": "error",
                "message": f"Unknown procurement stage: {stage}"
            }
