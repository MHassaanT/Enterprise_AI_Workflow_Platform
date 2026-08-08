"""
Centralized Multi-Tenant MCP Gateway — Tool Routing, Allowlist Verification,
Risk Assessment, Credential Decryption, and Vendor Adapter Routing.
"""
from typing import Dict, Any, Tuple
from tool_gateway.registry import TOOL_REGISTRY, get_allowed_tool_bindings
from tool_gateway.credentials_manager import fetch_tool_credentials
from tool_gateway.mcp_client import execute_remote_mcp_tool
from tool_gateway.adapters.airtable_adapter import execute_airtable_tool
from tool_gateway.adapters.resend_adapter import execute_resend_tool
from tool_gateway.adapters.hubspot_adapter import execute_hubspot_tool
from tool_gateway.adapters.safepay_adapter import execute_safepay_tool
from tool_gateway.adapters.supabase_adapter import execute_supabase_tool
from tool_gateway.adapters.github_adapter import execute_github_tool
from tool_gateway.adapters.vercel_adapter import execute_vercel_tool
from tool_gateway.adapters.clickup_adapter import execute_clickup_tool
from tool_gateway.adapters.stripe_adapter import execute_stripe_tool
from tool_gateway.adapters.gmail_adapter import execute_gmail_tool


def _find_matching_binding(bindings: list, tool_name: str) -> dict | None:
    norm_req = tool_name.lower().replace("-", "_").replace(" ", "_")
    for b in bindings:
        b_name = b.get("tool_name", "")
        b_norm = b_name.lower().replace("-", "_").replace(" ", "_")
        if b_name == tool_name or b_norm == norm_req:
            return b
        if "order" in b_norm and "order" in norm_req:
            return b
        if "escalat" in b_norm and "escalat" in norm_req:
            return b
    return None


async def evaluate_tool_risk(agent_instance_id: str, tool_name: str) -> Tuple[bool, Dict[str, Any]]:
    """
    Evaluates whether a tool is authorized for an agent and determines its effective risk level.
    Returns: (is_high_risk, binding_info)
    """
    bindings = await get_allowed_tool_bindings(agent_instance_id)
    target = _find_matching_binding(bindings, tool_name)
    if not target:
        return False, {}

    # Check custom_risk_override first, fallback to binding/registry is_high_risk
    if target.get("custom_risk_override") is not None:
        is_high_risk = bool(target["custom_risk_override"])
    else:
        is_high_risk = bool(target.get("is_high_risk", False))

    return is_high_risk, target


async def execute_mcp_tool(
    tenant_id: str,
    agent_instance_id: str,
    tool_name: str,
    arguments: Dict[str, Any],
) -> str:
    """
    Centralized router for executing vendor, built-in, and dynamic MCP tools.
    Handles allowlist verification, credential decryption, and adapter routing.
    """
    # 1. Allowlist Verification & Risk Evaluation
    bindings = await get_allowed_tool_bindings(agent_instance_id)
    target_binding = _find_matching_binding(bindings, tool_name)

    if not target_binding:
        return f"Security Error: Tool '{tool_name}' is not authorized or bound for agent instance '{agent_instance_id}'."

    if target_binding.get("is_enabled") is False:
        return f"Security Error: Tool '{tool_name}' is currently disabled for this tenant."

    binding_id = target_binding.get("id")
    tool_id = target_binding.get("tool_id")
    provider_type = (target_binding.get("provider_type") or target_binding.get("connector_type") or "builtin").lower()

    # 2. Fetch & Decrypt Credentials
    credentials = {}
    if binding_id or tool_id:
        credentials = await fetch_tool_credentials(tenant_id, binding_id=binding_id, tool_id=tool_id)

    # 3. Adapter Routing
    try:
        if provider_type == "github" or "github" in tool_name.lower():
            return await execute_github_tool(tool_name, arguments, credentials)
        elif provider_type == "vercel" or "vercel" in tool_name.lower():
            return await execute_vercel_tool(tool_name, arguments, credentials)
        elif provider_type == "safepay" or "safepay" in tool_name.lower():
            return await execute_safepay_tool(tool_name, arguments, credentials)
        elif provider_type == "supabase" or "supabase" in tool_name.lower():
            return await execute_supabase_tool(tool_name, arguments, credentials)
        elif provider_type == "stripe" or "stripe" in tool_name.lower():
            return await execute_stripe_tool(tool_name, arguments, credentials)
        elif provider_type == "clickup" or "clickup" in tool_name.lower():
            return await execute_clickup_tool(tool_name, arguments, credentials)
        elif provider_type == "airtable" or "airtable" in tool_name.lower():
            return await execute_airtable_tool(tool_name, arguments, credentials)
        elif provider_type == "resend" or "resend" in tool_name.lower():
            return await execute_resend_tool(tool_name, arguments, credentials)
        elif provider_type == "hubspot" or "hubspot" in tool_name.lower():
            return await execute_hubspot_tool(tool_name, arguments, credentials)
        elif provider_type == "gmail" or "gmail" in tool_name.lower():
            return await execute_gmail_tool(tool_name, arguments, credentials)
        elif provider_type == "builtin" or tool_name in TOOL_REGISTRY or "order" in tool_name.lower() or "escalat" in tool_name.lower():
            norm_name = tool_name.lower().replace("-", "_").replace(" ", "_")
            tool_fn = TOOL_REGISTRY.get(norm_name) or TOOL_REGISTRY.get(tool_name)
            if not tool_fn and "order" in norm_name:
                tool_fn = TOOL_REGISTRY.get("check_order_status")
            elif not tool_fn and "escalat" in norm_name:
                tool_fn = TOOL_REGISTRY.get("escalate_to_human")

            if tool_fn:
                res = await tool_fn(**arguments, tenant_id=tenant_id, binding_id=binding_id, credentials=credentials)
                return str(res)
            else:
                return f"Error: Built-in tool '{tool_name}' not found in registry."
        else:
            # External / Remote MCP Server HTTP / SSE execution
            endpoint_url = target_binding.get("endpoint_url")
            auth_headers = target_binding.get("auth_headers") or {}
            if credentials.get("api_key"):
                auth_headers["Authorization"] = f"Bearer {credentials['api_key']}"
            elif credentials.get("access_token"):
                auth_headers["Authorization"] = f"Bearer {credentials['access_token']}"

            return await execute_remote_mcp_tool(
                endpoint_url=endpoint_url,
                tool_name=tool_name,
                arguments=arguments,
                auth_headers=auth_headers,
                transport_type=provider_type,
            )
    except Exception as e:
        return f"Error executing tool '{tool_name}' via Centralized Gateway: {str(e)}"


