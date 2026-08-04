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


async def evaluate_tool_risk(agent_instance_id: str, tool_name: str) -> Tuple[bool, Dict[str, Any]]:
    """
    Evaluates whether a tool is authorized for an agent and determines its effective risk level.
    Returns: (is_high_risk, binding_info)
    """
    bindings = await get_allowed_tool_bindings(agent_instance_id)
    target = next((b for b in bindings if b.get("tool_name") == tool_name), None)
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
    target_binding = next((b for b in bindings if b.get("tool_name") == tool_name), None)

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
        elif provider_type == "builtin" and tool_name in TOOL_REGISTRY:
            tool_fn = TOOL_REGISTRY[tool_name]
            res = await tool_fn(**arguments)
            return str(res)
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


