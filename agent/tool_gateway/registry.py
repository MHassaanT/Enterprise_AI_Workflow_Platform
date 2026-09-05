"""
MCP Tool Registry

Central registry mapping tool names to:
  - async callables (TOOL_REGISTRY)
  - Pydantic input models for validation (TOOL_INPUT_MODELS)
  - LangChain StructuredTool objects for LLM binding (LANGCHAIN_TOOLS)
  - Dynamic MCP connector tool generator via Postgres ToolBinding allowlist per agent_instance_id
  - Dynamic entity-specific tool generator from tenant context
"""
from typing import Callable, List, Dict, Any, Optional
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, create_model

from tool_gateway.tools.check_order_status import check_order_status_impl, CheckOrderStatusInput
from tool_gateway.tools.escalate_to_human import escalate_to_human_impl as legacy_escalate_impl, EscalateToHumanInput as LegacyEscalateInput
from tool_gateway.tools.submit_refund_request import submit_refund_request_impl, SubmitRefundRequestInput
from tool_gateway.tools.platform_primitives import (
    get_current_user_impl, GetCurrentUserInput,
    get_user_by_email_impl, GetUserByEmailInput,
    search_entities_impl, SearchEntitiesInput,
    get_entity_by_id_impl, GetEntityByIdInput,
    create_support_ticket_impl, CreateSupportTicketInput,
    get_support_tickets_impl, GetSupportTicketsInput,
    add_ticket_note_impl, AddTicketNoteInput,
    send_notification_impl, SendNotificationInput,
    get_platform_status_impl, GetPlatformStatusInput,
    escalate_to_human_impl, EscalateToHumanInput,
)
from tool_gateway.tools.authenticate_user_with_email import (
    authenticate_user_with_email_impl,
    AuthenticateUserWithEmailInput,
)
from tool_gateway.tools.appointment_tool import (
    create_appointment_impl,
    CreateAppointmentInput,
    get_appointments_impl,
    GetAppointmentsInput,
    reschedule_appointment_impl,
    RescheduleAppointmentInput,
    cancel_appointment_impl,
    CancelAppointmentInput,
)
from tool_gateway.mcp_client import execute_remote_mcp_tool
from services.db_client import get_agent_tool_bindings

# ── Core built-in registries ──

_check_order_desc = (
    "(Legacy) Returns the current status of a customer order by order_id or email address. "
    "Use this when the user asks about their order status, shipment, delivery, or order details."
)

_legacy_escalate_desc = (
    "(Legacy) Escalates an issue or high-risk action to a human supervisor for approval. "
    "Use when an ungrounded inquiry cannot be answered accurately from documents, "
    "or when an irreversible/high-risk action (such as refunds or credits) is requested."
)

_submit_refund_desc = (
    "(Legacy) Submits a refund request for an order. "
    "This is a high-risk tool and will require human approval. "
    "You MUST gather the customer's confirmed name, email, the refund reason, and the order details from check_order_status before calling this."
)

# ── Tool Descriptions for Platform Primitives ──

TOOL_DESCRIPTIONS: Dict[str, str] = {
    "get_current_user": (
        "Get the currently authenticated user. ALWAYS call this first when a user starts a conversation "
        "so you know who you're helping."
    ),
    "get_user_by_email": (
        "Look up a user account by email address. Use this to identify a user when they mention their email."
    ),
    "search_entities": (
        "Search for records across the platform by entity type. "
        "CRITICAL: Always provide a specific identifier (such as record ID, customer name, phone, or email) in query. "
        "DO NOT search blindly without customer identifiers. If the customer has not provided their identifying information, ask them first. "
        "If multiple records are returned, ask the customer to clarify which one is theirs; NEVER guess or pick the first record."
    ),
    "get_entity_by_id": (
        "Fetch a specific record by its ID and entity type. Use after search_entities to get full details."
    ),
    "create_support_ticket": (
        "Create a support ticket to track this issue. "
        "Use this when the issue is complex, needs follow-up, or you need to escalate."
    ),
    "get_support_tickets": (
        "Retrieve existing support tickets for a user or tenant."
    ),
    "add_ticket_note": (
        "Append findings or actions to an existing support ticket."
    ),
    "send_notification": (
        "Send an email or in-app message to the user. Use this to confirm actions or provide updates."
    ),
    "get_platform_status": (
        "Check if the platform is experiencing known incidents or outages. "
        "Use this when a user reports something not working."
    ),
    "escalate_to_human": (
        "Hand off to a human support agent with full conversation context. "
        "Use this when you cannot resolve the issue, the user is frustrated, or they explicitly ask for a human."
    ),
    "authenticate_user_with_email": (
        "Send and verify a 6-digit OTP code to a customer's email address. "
        "Use action='send_otp' when a customer requests user-specific sensitive actions or private account access (such as refunds, account modifications, or private personal data). "
        "Use action='verify_otp' with otp_code when the user provides the code in chat. Do NOT use for general or public inquiries."
    ),
    "create_appointment": (
        "Book an appointment, discovery call, consultation, or meeting for a customer with the company/team. "
        "Use this whenever a user wants to discuss partnerships, business development, services, enterprise inquiries, "
        "or whenever a scheduled meeting is the best way to address the user's need or resolve an issue. "
        "Requires customer_name, customer_email, service_type, appointment_date (YYYY-MM-DD), and appointment_time."
    ),
    "get_appointments": (
        "Query or check existing appointments for a date, customer email, or status to verify availability or bookings."
    ),
    "reschedule_appointment": (
        "Reschedule an existing scheduled appointment or meeting to a new date and/or time. "
        "Requires new_date (YYYY-MM-DD), new_time, and either appointment_id or customer_email. "
        "CRITICAL: Always use this tool when a customer asks to change the time or date of an existing appointment; NEVER use create_appointment."
    ),
    "cancel_appointment": (
        "Cancel an existing scheduled appointment or meeting. "
        "Requires either appointment_id or customer_email, and optional reason. "
        "CRITICAL: Always use this tool when a customer asks to cancel an appointment; NEVER use create_appointment."
    ),
    # Legacy tools
    "check_order_status": _check_order_desc,
    "check_order_details": _check_order_desc,
    "check_order": _check_order_desc,
    "order_status": _check_order_desc,
    "escalate": _legacy_escalate_desc,
    "human_escalation": _legacy_escalate_desc,
    "submit_refund_request": _submit_refund_desc,
}

# ── Registries ──

TOOL_REGISTRY: Dict[str, Callable] = {
    # Platform primitives
    "get_current_user": get_current_user_impl,
    "get_user_by_email": get_user_by_email_impl,
    "search_entities": search_entities_impl,
    "get_entity_by_id": get_entity_by_id_impl,
    "create_support_ticket": create_support_ticket_impl,
    "get_support_tickets": get_support_tickets_impl,
    "add_ticket_note": add_ticket_note_impl,
    "send_notification": send_notification_impl,
    "get_platform_status": get_platform_status_impl,
    "escalate_to_human": escalate_to_human_impl,
    "authenticate_user_with_email": authenticate_user_with_email_impl,
    "create_appointment": create_appointment_impl,
    "get_appointments": get_appointments_impl,
    "reschedule_appointment": reschedule_appointment_impl,
    "cancel_appointment": cancel_appointment_impl,
    # Legacy tools (backward compatible)
    "check_order_status": check_order_status_impl,
    "check_order_details": check_order_status_impl,
    "check_order": check_order_status_impl,
    "order_status": check_order_status_impl,
    "human_escalation": legacy_escalate_impl,
    "escalate": legacy_escalate_impl,
    "submit_refund_request": submit_refund_request_impl,
}

TOOL_INPUT_MODELS: Dict[str, type] = {
    # Platform primitives
    "get_current_user": GetCurrentUserInput,
    "get_user_by_email": GetUserByEmailInput,
    "search_entities": SearchEntitiesInput,
    "get_entity_by_id": GetEntityByIdInput,
    "create_support_ticket": CreateSupportTicketInput,
    "get_support_tickets": GetSupportTicketsInput,
    "add_ticket_note": AddTicketNoteInput,
    "send_notification": SendNotificationInput,
    "get_platform_status": GetPlatformStatusInput,
    "escalate_to_human": EscalateToHumanInput,
    "authenticate_user_with_email": AuthenticateUserWithEmailInput,
    "create_appointment": CreateAppointmentInput,
    "get_appointments": GetAppointmentsInput,
    "reschedule_appointment": RescheduleAppointmentInput,
    "cancel_appointment": CancelAppointmentInput,
    # Legacy tools
    "check_order_status": CheckOrderStatusInput,
    "check_order_details": CheckOrderStatusInput,
    "check_order": CheckOrderStatusInput,
    "order_status": CheckOrderStatusInput,
    "human_escalation": LegacyEscalateInput,
    "escalate": LegacyEscalateInput,
    "submit_refund_request": SubmitRefundRequestInput,
}

# Pre-built LangChain tools for legacy built-ins
BUILTIN_LANGCHAIN_TOOLS: Dict[str, StructuredTool] = {
    "check_order_status": StructuredTool.from_function(
        coroutine=check_order_status_impl,
        name="check_order_status",
        description=_check_order_desc,
        args_schema=CheckOrderStatusInput,
    ),
    "check_order_details": StructuredTool.from_function(
        coroutine=check_order_status_impl,
        name="check_order_details",
        description=_check_order_desc,
        args_schema=CheckOrderStatusInput,
    ),
    "check_order": StructuredTool.from_function(
        coroutine=check_order_status_impl,
        name="check_order",
        description=_check_order_desc,
        args_schema=CheckOrderStatusInput,
    ),
    "order_status": StructuredTool.from_function(
        coroutine=check_order_status_impl,
        name="order_status",
        description=_check_order_desc,
        args_schema=CheckOrderStatusInput,
    ),
    "escalate_to_human": StructuredTool.from_function(
        coroutine=escalate_to_human_impl,
        name="escalate_to_human",
        description=TOOL_DESCRIPTIONS["escalate_to_human"],
        args_schema=EscalateToHumanInput,
    ),
    "human_escalation": StructuredTool.from_function(
        coroutine=legacy_escalate_impl,
        name="human_escalation",
        description=_legacy_escalate_desc,
        args_schema=LegacyEscalateInput,
    ),
    "escalate": StructuredTool.from_function(
        coroutine=legacy_escalate_impl,
        name="escalate",
        description=_legacy_escalate_desc,
        args_schema=LegacyEscalateInput,
    ),
    "submit_refund_request": StructuredTool.from_function(
        coroutine=submit_refund_request_impl,
        name="submit_refund_request",
        description=_submit_refund_desc,
        args_schema=SubmitRefundRequestInput,
    ),
    # Platform primitives
    "get_current_user": StructuredTool.from_function(
        coroutine=get_current_user_impl,
        name="get_current_user",
        description=TOOL_DESCRIPTIONS["get_current_user"],
        args_schema=GetCurrentUserInput,
    ),
    "get_user_by_email": StructuredTool.from_function(
        coroutine=get_user_by_email_impl,
        name="get_user_by_email",
        description=TOOL_DESCRIPTIONS["get_user_by_email"],
        args_schema=GetUserByEmailInput,
    ),
    "search_entities": StructuredTool.from_function(
        coroutine=search_entities_impl,
        name="search_entities",
        description=TOOL_DESCRIPTIONS["search_entities"],
        args_schema=SearchEntitiesInput,
    ),
    "get_entity_by_id": StructuredTool.from_function(
        coroutine=get_entity_by_id_impl,
        name="get_entity_by_id",
        description=TOOL_DESCRIPTIONS["get_entity_by_id"],
        args_schema=GetEntityByIdInput,
    ),
    "create_support_ticket": StructuredTool.from_function(
        coroutine=create_support_ticket_impl,
        name="create_support_ticket",
        description=TOOL_DESCRIPTIONS["create_support_ticket"],
        args_schema=CreateSupportTicketInput,
    ),
    "get_support_tickets": StructuredTool.from_function(
        coroutine=get_support_tickets_impl,
        name="get_support_tickets",
        description=TOOL_DESCRIPTIONS["get_support_tickets"],
        args_schema=GetSupportTicketsInput,
    ),
    "add_ticket_note": StructuredTool.from_function(
        coroutine=add_ticket_note_impl,
        name="add_ticket_note",
        description=TOOL_DESCRIPTIONS["add_ticket_note"],
        args_schema=AddTicketNoteInput,
    ),
    "send_notification": StructuredTool.from_function(
        coroutine=send_notification_impl,
        name="send_notification",
        description=TOOL_DESCRIPTIONS["send_notification"],
        args_schema=SendNotificationInput,
    ),
    "get_platform_status": StructuredTool.from_function(
        coroutine=get_platform_status_impl,
        name="get_platform_status",
        description=TOOL_DESCRIPTIONS["get_platform_status"],
        args_schema=GetPlatformStatusInput,
    ),
    "authenticate_user_with_email": StructuredTool.from_function(
        coroutine=authenticate_user_with_email_impl,
        name="authenticate_user_with_email",
        description=TOOL_DESCRIPTIONS["authenticate_user_with_email"],
        args_schema=AuthenticateUserWithEmailInput,
    ),
    "create_appointment": StructuredTool.from_function(
        coroutine=create_appointment_impl,
        name="create_appointment",
        description=TOOL_DESCRIPTIONS["create_appointment"],
        args_schema=CreateAppointmentInput,
    ),
    "get_appointments": StructuredTool.from_function(
        coroutine=get_appointments_impl,
        name="get_appointments",
        description=TOOL_DESCRIPTIONS["get_appointments"],
        args_schema=GetAppointmentsInput,
    ),
    "reschedule_appointment": StructuredTool.from_function(
        coroutine=reschedule_appointment_impl,
        name="reschedule_appointment",
        description=TOOL_DESCRIPTIONS["reschedule_appointment"],
        args_schema=RescheduleAppointmentInput,
    ),
    "cancel_appointment": StructuredTool.from_function(
        coroutine=cancel_appointment_impl,
        name="cancel_appointment",
        description=TOOL_DESCRIPTIONS["cancel_appointment"],
        args_schema=CancelAppointmentInput,
    ),
}


# ── Dynamic Allowlist & MCP Tool Resolution ──

async def get_allowed_tool_bindings(agent_instance_id: str, tenant_id: str = None) -> List[Dict[str, Any]]:
    """
    Fetch the list of allowed tool dictionaries for a specific agent instance or tenant.
    """
    from services.db_client import get_agent_tool_bindings, get_tenant_tool_bindings
    if agent_instance_id == "workflow-builder" and tenant_id:
        res = await get_tenant_tool_bindings(tenant_id)
    else:
        res = await get_agent_tool_bindings(agent_instance_id)
    return res.get("tools", [])


async def get_allowed_tools(agent_instance_id: str) -> List[str]:
    """Returns list of tool names allowed for this agent."""
    bindings = await get_allowed_tool_bindings(agent_instance_id)
    return [b["tool_name"] for b in bindings]


def _build_dynamic_schema(tool_name: str, config: Dict[str, Any]) -> type:
    """
    Builds a Pydantic model from the tool binding's config.parameters so the LLM
    receives a proper JSON schema with user-facing field names and descriptions.

    Supports two config shapes:
      - config.parameters = {"order_id": {"description": "...", "type": "string"}, ...}
      - config.parameters = [{"name": "order_id", "description": "...", "type": "string"}, ...]
    Falls back to a single generic 'query' field if no parameters are defined.
    """
    if "gmail" in tool_name.lower():
        class GmailDynamicInput(BaseModel):
            action: str = Field(description="The action to perform (e.g. 'gmail_send_email')")
            to: str = Field(description="Recipient email address (required for sending)")
            subject: str = Field(description="Email subject")
            body: str = Field(description="Email body text")
            q: str = Field(default="", description="Search query")
            limit: int = Field(default=10, description="Max results")
        return GmailDynamicInput
    elif "google_doc" in tool_name.lower() or "docs" in tool_name.lower():
        class GoogleDocsDynamicInput(BaseModel):
            action: str = Field(description="Action to perform: 'read_document', 'append_text', or 'create_document'")
            document_id: str = Field(default=None, description="Google Document ID")
            text: str = Field(default=None, description="Text content to append")
            title: str = Field(default=None, description="Title for new document")
        return GoogleDocsDynamicInput
    elif "google_sheet" in tool_name.lower() or "sheets" in tool_name.lower():
        class GoogleSheetsDynamicInput(BaseModel):
            action: str = Field(description="Action to perform: 'read_range', 'update_rows', or 'create_spreadsheet'")
            spreadsheet_id: str = Field(default=None, description="Google Spreadsheet ID")
            range: str = Field(default=None, description="Cell range in A1 notation (e.g. Sheet1!A1:B10)")
            values: Any = Field(default=None, description="Values/rows data (2D array)")
            title: str = Field(default=None, description="Title for new spreadsheet")
        return GoogleSheetsDynamicInput
    elif "github" in tool_name.lower():
        class GitHubDynamicInput(BaseModel):
            action: str = Field(description="Action to perform: 'create_branch', 'get_issues', 'get_pull_requests', or 'trigger_workflow'")
            owner: str = Field(default=None, description="GitHub repository owner/organization")
            repo: str = Field(default=None, description="GitHub repository name")
            branch_name: str = Field(default=None, description="Name of the new branch to create")
            base_branch: str = Field(default="main", description="Base branch to create from (default: main)")
            issue_number: int = Field(default=None, description="Issue number")
            pull_number: int = Field(default=None, description="Pull request number")
            workflow_id: str = Field(default=None, description="Workflow ID or filename for dispatch")
            ref: str = Field(default=None, description="Git ref or branch for workflow dispatch")
        return GitHubDynamicInput

    params_raw = config.get("parameters") or config.get("params") or {}

    field_definitions: Dict[str, Any] = {}

    if isinstance(params_raw, dict):
        for param_name, param_info in params_raw.items():
            desc = param_info.get("description", "") if isinstance(param_info, dict) else str(param_info)
            required = param_info.get("required", False) if isinstance(param_info, dict) else False
            if required:
                field_definitions[param_name] = (str, Field(description=desc))
            else:
                field_definitions[param_name] = (str, Field(default=None, description=desc))
    elif isinstance(params_raw, list):
        for param_info in params_raw:
            if isinstance(param_info, dict):
                param_name = param_info.get("name", "input")
                desc = param_info.get("description", "")
                required = param_info.get("required", False)
                if required:
                    field_definitions[param_name] = (str, Field(description=desc))
                else:
                    field_definitions[param_name] = (str, Field(default=None, description=desc))

    # Fallback: if no parameters were defined, provide a generic 'query' field
    if not field_definitions:
        field_definitions["query"] = (
            str,
            Field(description="The query, identifier, or search term to pass to the tool"),
        )

    # Sanitize tool name to be a valid Python class identifier
    safe_name = "".join(c if c.isalnum() else "_" for c in tool_name).strip("_") or "DynamicTool"
    return create_model(f"{safe_name}_Input", **field_definitions)


def _make_mcp_executor(tool_name: str, tenant_id: str, agent_instance_id: str):
    """
    Factory that returns a clean async callable whose signature is just **kwargs.
    Internal routing variables (tool_name, tenant_id, agent_instance_id) are captured
    in the closure scope and never exposed in the function signature, so
    StructuredTool.from_function won't leak them into the LLM's tool schema.
    """
    async def executor(**kwargs):
        from tool_gateway.centralized_gateway import execute_mcp_tool
        return await execute_mcp_tool(
            tenant_id=tenant_id,
            agent_instance_id=agent_instance_id,
            tool_name=tool_name,
            arguments=kwargs,
        )
    return executor


class DynamicSearchInput(BaseModel):
    query: Optional[str] = Field(default=None, description="Specific identifier to search for: record ID, customer name, phone number, or email address.")
    user_id: Optional[str] = Field(default=None, description="Filter by user or customer ID.")
    filters: Optional[dict] = Field(default=None, description="Additional field filters (e.g. {'status': 'cancelled'}).")
    limit: int = Field(default=10, description="Max results.")


class DynamicGetByIdInput(BaseModel):
    record_id: str = Field(description="The unique ID of the record to fetch.")


def _make_entity_search_func(entity_name: str):
    async def search_func(query: Optional[str] = None, user_id: Optional[str] = None, filters: Optional[dict] = None, limit: int = 10, **kwargs):
        return await search_entities_impl(entity_type=entity_name, query=query, user_id=user_id, filters=filters, limit=limit, **kwargs)
    return search_func


def _make_entity_get_func(entity_name: str):
    async def get_func(record_id: str, **kwargs):
        return await get_entity_by_id_impl(record_id=record_id, entity_type=entity_name, **kwargs)
    return get_func


def _build_entity_tools(tenant_context: dict) -> List[StructuredTool]:
    """
    Generate per-entity search and get tools from the tenant's configured entities.
    These are dynamically created StructuredTool instances that the LLM can call.
    """
    entities = tenant_context.get("entities", [])
    tools = []

    for entity in entities:
        name = entity.get("entity_name", "")
        display = entity.get("display_name", name)
        desc = entity.get("description", "")
        ops = entity.get("operations", [])
        fields = entity.get("fields", [])

        field_descs = ", ".join(
            [f"{f.get('field_name')} ({f.get('field_type')})" for f in fields]
        )
        op_names = [o.get("operation_name") for o in ops if o.get("is_enabled", True)]

        if "search" in op_names:
            search_tool = StructuredTool.from_function(
                name=f"search_{name}",
                description=(
                    f"Search for {display} records on the platform. "
                    f"CRITICAL: Always specify a specific customer identifier (such as {name}_id, customer name, phone, or email) in query. "
                    f"If the user has not provided their identifying information or record ID, ask them for it first before calling this tool. "
                    f"If multiple records are returned, NEVER pick one arbitrarily—ask the customer to clarify which record is theirs. "
                    f"Fields: {field_descs}."
                ),
                args_schema=DynamicSearchInput,
                coroutine=_make_entity_search_func(name),
            )
            tools.append(search_tool)

        if "get_by_id" in op_names:
            get_tool = StructuredTool.from_function(
                name=f"get_{name}_by_id",
                description=(
                    f"Fetch a specific {display} record by its ID. "
                    f"Use after search to get full details."
                ),
                args_schema=DynamicGetByIdInput,
                coroutine=_make_entity_get_func(name),
            )
            tools.append(get_tool)

    return tools


async def get_tools_for_agent(agent_instance_id: str, tenant_context: dict = None) -> List[StructuredTool]:
    """
    Generates and returns LangChain StructuredTool objects for binding to the LLM,
    strictly restricted to the agent's ToolBinding allowlist,
    plus any dynamic entity-specific tools from tenant context.
    """
    bindings = await get_allowed_tool_bindings(agent_instance_id)
    tools: List[StructuredTool] = []

    for binding in bindings:
        tool_name = binding.get("tool_name", "")
        connector_type = (binding.get("connector_type") or binding.get("provider_type") or "builtin").lower()
        norm_name = tool_name.lower().replace("-", "_").replace(" ", "_")

        # 1. Check if it's a built-in platform tool (direct match or alias)
        if connector_type == "builtin" or norm_name in BUILTIN_LANGCHAIN_TOOLS or "order" in norm_name or "escalat" in norm_name or "refund" in norm_name:
            if norm_name in BUILTIN_LANGCHAIN_TOOLS:
                tools.append(BUILTIN_LANGCHAIN_TOOLS[norm_name])
                continue
            elif "order" in norm_name:
                tools.append(StructuredTool.from_function(
                    coroutine=check_order_status_impl,
                    name=tool_name,
                    description=_check_order_desc,
                    args_schema=CheckOrderStatusInput,
                ))
                continue
            elif "escalat" in norm_name:
                tools.append(StructuredTool.from_function(
                    coroutine=escalate_to_human_impl,
                    name=tool_name,
                    description=TOOL_DESCRIPTIONS["escalate_to_human"],
                    args_schema=EscalateToHumanInput,
                ))
                continue
            elif "refund" in norm_name:
                tools.append(StructuredTool.from_function(
                    coroutine=submit_refund_request_impl,
                    name=tool_name,
                    description=_submit_refund_desc,
                    args_schema=SubmitRefundRequestInput,
                ))
                continue

        # 2. Dynamic MCP / Vendor Adapter tool
        tenant_id = binding.get("tenant_id", "")
        config = binding.get("config") or {}
        description = config.get("description") or f"Execute {tool_name} tool via Centralized Integration Gateway."

        # Build a proper args_schema from binding config so the LLM sees
        # real user-facing parameters instead of internal routing args.
        input_schema = _build_dynamic_schema(tool_name, config)

        # Factory function isolates internal routing vars from the tool's
        # public signature — the LLM only sees args_schema fields.
        executor = _make_mcp_executor(tool_name, tenant_id, agent_instance_id)

        mcp_tool = StructuredTool.from_function(
            coroutine=executor,
            name=tool_name,
            description=description,
            args_schema=input_schema,
        )
        tools.append(mcp_tool)

    # Add dynamic entity-specific tools from tenant context
    if tenant_context:
        tools.extend(_build_entity_tools(tenant_context))

    # Always ensure email authentication and appointment tools are available for customer support
    if not any(t.name == "authenticate_user_with_email" for t in tools):
        tools.append(BUILTIN_LANGCHAIN_TOOLS["authenticate_user_with_email"])
    if not any(t.name == "create_appointment" for t in tools):
        tools.append(BUILTIN_LANGCHAIN_TOOLS["create_appointment"])
    if not any(t.name == "get_appointments" for t in tools):
        tools.append(BUILTIN_LANGCHAIN_TOOLS["get_appointments"])
    if not any(t.name == "reschedule_appointment" for t in tools):
        tools.append(BUILTIN_LANGCHAIN_TOOLS["reschedule_appointment"])
    if not any(t.name == "cancel_appointment" for t in tools):
        tools.append(BUILTIN_LANGCHAIN_TOOLS["cancel_appointment"])

    return tools
