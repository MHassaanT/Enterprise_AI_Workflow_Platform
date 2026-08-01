"""
SafePay Adapter — translates tool requests to SafePay API.
Injects decrypted Secret Key into request HTTP headers.
"""
from typing import Dict, Any
import httpx


async def execute_safepay_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    """
    Executes SafePay API calls using decrypted secret key injected into HTTP headers.
    """
    secret_key = (
        credentials.get("secret_key")
        or credentials.get("api_key")
        or credentials.get("bearer_token")
    )
    if not secret_key:
        return "Error: SafePay Secret Key is missing from tenant credentials."

    headers = {
        "X-SAMPAY-SECRET": secret_key,
        "Authorization": f"Bearer {secret_key}",
        "Content-Type": "application/json",
    }

    action = arguments.get("action") or tool_name
    action_lower = action.lower()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Verify Transaction
            if "verify" in action_lower:
                transaction_id = arguments.get("transaction_id") or arguments.get("tracker_id")
                if not transaction_id:
                    return "Error: 'transaction_id' is required to verify SafePay transaction."

                url = f"https://api.getsafepay.com/order/v1/verify/{transaction_id}"
                res = await client.get(url, headers=headers)
                
                if res.is_success:
                    data = res.json()
                    return f"SafePay Transaction Verification Result: {data}"
                return f"SafePay API Error ({res.status_code}): {res.text}"

            # 2. Generate Checkout / Payment Link
            elif "generate" in action_lower or "link" in action_lower or "checkout" in action_lower:
                amount = arguments.get("amount", 0)
                currency = arguments.get("currency", "PKR")
                
                url = "https://api.getsafepay.com/order/v1/init"
                payload = {
                    "client": secret_key[:10],
                    "amount": amount,
                    "currency": currency,
                    "environment": "sandbox",
                }
                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    data = res.json()
                    tracker = data.get("data", {}).get("token", "tracker_id")
                    checkout_url = f"https://sandbox.api.getsafepay.com/checkout/pay?tracker={tracker}"
                    return f"Successfully generated SafePay checkout link: {checkout_url} (Tracker: {tracker})"
                return f"SafePay Link Generation Error ({res.status_code}): {res.text}"

            # 3. Generic / Custom SafePay Request
            else:
                endpoint = arguments.get("endpoint", "/order/v1/init")
                url = f"https://api.getsafepay.com{endpoint}"
                res = await client.post(url, headers=headers, json=arguments)
                if res.is_success:
                    return f"SafePay API Response: {res.json()}"
                return f"SafePay API Response ({res.status_code}): {res.text}"

    except Exception as e:
        return f"SafePay execution exception: {str(e)}"
