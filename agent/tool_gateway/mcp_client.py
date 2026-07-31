"""
MCP Client Gateway — executes tool calls against external MCP servers via JSON-RPC over HTTP/SSE.
"""
import httpx
from typing import Any, Dict


async def execute_remote_mcp_tool(
    endpoint_url: str,
    tool_name: str,
    arguments: Dict[str, Any],
    auth_headers: Dict[str, str] = None,
    transport_type: str = "http",
) -> str:
    """
    Invokes an external MCP server's tools/call method via JSON-RPC 2.0 protocol.
    """
    if not endpoint_url:
        raise ValueError(f"Endpoint URL missing for MCP tool '{tool_name}'")

    headers = {"Content-Type": "application/json"}
    if auth_headers:
        headers.update(auth_headers)

    json_rpc_payload = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(endpoint_url, json=json_rpc_payload, headers=headers)
            response.raise_for_status()
            res_data = response.json()

            if "error" in res_data:
                return f"MCP Tool Error: {res_data['error']}"

            result = res_data.get("result", {})
            if isinstance(result, dict) and "content" in result:
                # MCP standard result format: {"content": [{"type": "text", "text": "..."}]}
                contents = result["content"]
                text_parts = [c.get("text", "") for c in contents if c.get("type") == "text"]
                return "\n".join(text_parts) if text_parts else str(result)

            return str(result)
    except Exception as e:
        print(f"[MCP CLIENT ERROR] Execution failed for tool {tool_name} at {endpoint_url}: {e}")
        return f"Execution of MCP tool '{tool_name}' failed: {str(e)}"
