from pydantic import BaseModel, Field
import json

class SubmitRefundRequestInput(BaseModel):
    order_id: str = Field(..., description="The ID of the order to refund")
    customer_name: str = Field(..., description="The confirmed name of the customer")
    customer_email: str = Field(..., description="The confirmed email of the customer")
    order_details: str = Field(..., description="The complete serialized details of the order retrieved from the check_order_status tool")
    refund_reason: str = Field(..., description="The reason provided by the customer for the refund")

async def submit_refund_request_impl(
    order_id: str,
    customer_name: str,
    customer_email: str,
    order_details: str,
    refund_reason: str,
    **kwargs
) -> str:
    """
    Submits a refund request. Because it's a high risk action, it will trigger an approval checkpoint.
    The returned string contains the JSON payload that will be captured by the approval checkpoint node.
    """
    payload = {
        "orderId": order_id,
        "userName": customer_name,
        "userEmail": customer_email,
        "orderDetails": order_details,
        "userRequest": refund_reason
    }
    # Return as JSON string so it can be parsed by the approval checkpoint node
    return json.dumps(payload)
