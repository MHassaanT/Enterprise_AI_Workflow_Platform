"""
Authenticate User With Email Tool — Generates, sends via Gmail, and verifies OTP codes
for Customer Support Agent conversations without external third-party verification services.
"""
from typing import Optional, Dict, Any, Literal
import httpx
from pydantic import BaseModel, Field
from config import settings
from tool_gateway.credentials_manager import fetch_tool_credentials
from tool_gateway.adapters.gmail_adapter import execute_gmail_tool


class AuthenticateUserWithEmailInput(BaseModel):
    email: str = Field(
        ...,
        description="The customer's email address to send the verification code to or verify against."
    )
    action: Literal["send_otp", "verify_otp"] = Field(
        ...,
        description="'send_otp' to generate and email a 6-digit verification code via Gmail, or 'verify_otp' to check the code provided by the customer."
    )
    otp_code: Optional[str] = Field(
        None,
        description="The 6-digit verification code provided by the customer in chat. Required when action is 'verify_otp'."
    )


_HEADERS = lambda: {"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN}


async def authenticate_user_with_email_impl(
    email: str,
    action: str,
    otp_code: Optional[str] = None,
    tenant_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    **kwargs,
) -> str:
    """
    In-house email authentication tool for customer support.
    Generates, sends (via Gmail API), and verifies OTPs directly in the conversation.
    """
    clean_email = email.strip().lower()
    clean_action = action.strip().lower()

    if not clean_email:
        return "Error: A valid 'email' address is required for authentication."

    # ── ACTION 1: SEND OTP ──
    if clean_action == "send_otp":
        try:
            # 1. Request backend to generate and persist OTP
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{settings.BACKEND_URL}/internal/otp/generate",
                    json={
                        "tenantId": tenant_id,
                        "email": clean_email,
                        "conversationId": conversation_id,
                        "expiresInMinutes": 10,
                    },
                    headers=_HEADERS(),
                )
                if not res.is_success:
                    return f"Error: Failed to generate verification code: {res.text}"
                
                data = res.json()
                generated_otp = data.get("otpCode")

            if not generated_otp:
                return "Error: Backend did not return an OTP code."

            # 2. Fetch tenant Gmail credentials
            gmail_creds = dict(credentials or {})
            if not (gmail_creds.get("access_token") or gmail_creds.get("bearer_token")):
                fetched_creds = await fetch_tool_credentials(tenant_id or "", tool_id="gmail")
                if fetched_creds:
                    gmail_creds.update(fetched_creds)

            # 3. Verify Gmail credentials exist
            has_token = bool(gmail_creds.get("access_token") or gmail_creds.get("bearer_token"))
            if not has_token:
                # In development or testing without live Gmail OAuth, report clear message
                print(f"[AUTH_TOOL] [DEV_FALLBACK] Generated OTP for {clean_email}: {generated_otp}")
                return (
                    f"Notice: Gmail integration is not connected for tenant '{tenant_id}'. "
                    f"(Development code: {generated_otp}). "
                    f"Please connect Gmail in the Integrations Hub to deliver live emails. "
                    f"Ask the user to provide their verification code."
                )

            # 4. Dispatch email using Gmail REST API adapter
            subject = "Your Verification Code"
            body = (
                f"Your 6-digit verification code is: {generated_otp}\n\n"
                f"This code is valid for 10 minutes. Please enter it into the chat to verify your identity.\n"
                f"If you did not request this code, you can safely ignore this email."
            )
            html = f"""
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 8px; font-size: 20px; font-weight: 700;">Identity Verification</h2>
                <p style="color: #475569; font-size: 14px; line-height: 1.5; margin-bottom: 20px;">
                    We received a request to access your account information. Please use the verification code below to confirm your identity:
                </p>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
                    <span style="font-family: monospace, Courier, sans-serif; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #2563eb;">
                        {generated_otp}
                    </span>
                </div>
                <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 8px;">
                    ⏰ <strong>Valid for 10 minutes.</strong> Never share this code with anyone.
                </p>
                <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-top: 16px; border-top: 1px solid #f1f5f9; padding-top: 12px;">
                    If you did not request this verification, please ignore this email.
                </p>
            </div>
            """

            send_result = await execute_gmail_tool(
                tool_name="send_email",
                arguments={"action": "send_email", "to": clean_email, "subject": subject, "body": body, "html": html},
                credentials=gmail_creds,
            )

            if "Error" in send_result or "failed" in send_result.lower():
                return f"Error sending verification email via Gmail: {send_result}"

            return (
                f"Successfully sent a 6-digit verification code to '{clean_email}' via Gmail. "
                f"Instruct the user to check their email inbox and reply in this chat with the 6-digit code."
            )

        except Exception as e:
            return f"Error during OTP generation and dispatch: {str(e)}"

    # ── ACTION 2: VERIFY OTP ──
    elif clean_action == "verify_otp":
        if not otp_code:
            return "Error: 'otp_code' is required when action is 'verify_otp'. Please ask the user for the 6-digit code."

        clean_code = otp_code.strip()

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{settings.BACKEND_URL}/internal/otp/verify",
                    json={
                        "tenantId": tenant_id,
                        "email": clean_email,
                        "otpCode": clean_code,
                        "conversationId": conversation_id,
                    },
                    headers=_HEADERS(),
                )
                if not res.is_success:
                    return f"Error verifying OTP with backend: {res.text}"

                result_data = res.json()

            if result_data.get("verified"):
                return (
                    f"Verification SUCCESSFUL. User '{clean_email}' is now fully authenticated. "
                    f"You may now proceed to answer their question, look up their data, or execute their request."
                )
            else:
                remaining = result_data.get("remainingAttempts", 0)
                reason = result_data.get("message", "Incorrect or expired verification code.")
                return (
                    f"Verification FAILED: {reason} "
                    f"Remaining attempts: {remaining}. Please inform the user."
                )

        except Exception as e:
            return f"Error verifying code: {str(e)}"

    else:
        return f"Error: Invalid action '{action}'. Must be either 'send_otp' or 'verify_otp'."
