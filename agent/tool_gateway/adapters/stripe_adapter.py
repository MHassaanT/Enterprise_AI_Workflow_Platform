"""
Stripe Adapter — translates billing and payment operations to Stripe REST API using Restricted API Key.
"""
from typing import Dict, Any
import httpx


async def execute_stripe_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    api_key = credentials.get("api_key") or credentials.get("secret_key") or credentials.get("access_token")
    if not api_key:
        return "Error: Stripe Restricted API Key is missing from tenant credentials."

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    action = arguments.get("action") or tool_name

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if action in ("stripe_check_subscription", "check_subscription", "get_subscriptions"):
                customer_id = arguments.get("customer_id")
                if not customer_id:
                    return "Error: 'customer_id' is required to check Stripe subscription status."
                
                url = f"https://api.stripe.com/v1/subscriptions?customer={customer_id}"
                res = await client.get(url, headers=headers)
                if res.is_success:
                    subs = res.json().get("data", [])
                    if not subs:
                        return f"No active or past subscriptions found for Stripe customer '{customer_id}'."
                    formatted_subs = [
                        {"id": s.get("id"), "status": s.get("status"), "current_period_end": s.get("current_period_end")}
                        for s in subs
                    ]
                    return f"Stripe subscriptions for customer '{customer_id}': {formatted_subs}"
                return f"Stripe API Error ({res.status_code}): {res.text}"

            elif action in ("stripe_process_refund", "process_refund", "create_refund"):
                charge_id = arguments.get("charge_id") or arguments.get("payment_intent")
                if not charge_id:
                    return "Error: 'charge_id' or 'payment_intent' is required to process a refund."
                
                url = "https://api.stripe.com/v1/refunds"
                payload = {}
                if charge_id.startswith("ch_"):
                    payload["charge"] = charge_id
                else:
                    payload["payment_intent"] = charge_id

                if arguments.get("amount"):
                    # Stripe expects amounts in cents
                    payload["amount"] = str(int(float(arguments.get("amount")) * 100))
                if arguments.get("reason"):
                    payload["reason"] = arguments.get("reason")

                res = await client.post(url, headers=headers, data=payload)
                if res.is_success:
                    refund = res.json()
                    return f"Stripe refund processed successfully! Refund ID: {refund.get('id')}, Amount: {refund.get('amount') / 100} {refund.get('currency', 'usd').upper()}, Status: {refund.get('status')}"
                return f"Stripe Refund Error ({res.status_code}): {res.text}"

            elif action in ("stripe_get_customer", "get_customer", "search_customer"):
                customer_id = arguments.get("customer_id")
                email = arguments.get("email")

                if customer_id:
                    url = f"https://api.stripe.com/v1/customers/{customer_id}"
                    res = await client.get(url, headers=headers)
                    if res.is_success:
                        c = res.json()
                        return f"Stripe Customer ({customer_id}): Email: {c.get('email')}, Balance: {c.get('balance')}, Delinquent: {c.get('delinquent')}"
                    return f"Stripe API Error ({res.status_code}): {res.text}"
                elif email:
                    url = f"https://api.stripe.com/v1/customers?email={email}"
                    res = await client.get(url, headers=headers)
                    if res.is_success:
                        customers = res.json().get("data", [])
                        if customers:
                            c = customers[0]
                            return f"Found Stripe customer ID '{c.get('id')}' for email '{email}': Balance: {c.get('balance')}, Created: {c.get('created')}"
                        return f"No Stripe customer found for email '{email}'."
                    return f"Stripe API Error ({res.status_code}): {res.text}"
                else:
                    return "Error: Either 'customer_id' or 'email' is required to retrieve a Stripe customer."

            else:
                return f"Error: Unknown or unsupported Stripe billing action '{action}'."
    except Exception as e:
        return f"Stripe execution exception: {str(e)}"
