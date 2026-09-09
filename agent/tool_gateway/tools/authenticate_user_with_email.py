"""
Authenticate User With Email & WhatsApp Tool — Generates, validates via Baileys onWhatsApp(),
dispatches via WhatsApp or Gmail, and verifies OTP codes for Customer Support Agent conversations
without external third-party verification services.
"""
from typing import Optional, Dict, Any, Literal
import httpx
from pydantic import BaseModel, Field
from config import settings
from tool_gateway.credentials_manager import fetch_tool_credentials
from tool_gateway.adapters.gmail_adapter import execute_gmail_tool


class AuthenticateUserWithEmailInput(BaseModel):
    email: Optional[str] = Field(
        None,
        description="The customer's email address (if verifying via Email OTP)."
    )
    phone: Optional[str] = Field(
        None,
        description="The customer's phone or WhatsApp number (if verifying via WhatsApp OTP)."
    )
    action: Literal["send_otp", "verify_otp"] = Field(
        ...,
        description="'send_otp' to generate and send a 6-digit verification code via WhatsApp or Gmail, or 'verify_otp' to check the code provided by the customer."
    )
    otp_code: Optional[str] = Field(
        None,
        description="The 6-digit verification code provided by the customer in chat. Required when action is 'verify_otp'."
    )


_HEADERS = lambda: {"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN}


async def authenticate_user_with_email_impl(
    email: Optional[str] = None,
    phone: Optional[str] = None,
    action: str = "send_otp",
    otp_code: Optional[str] = None,
    tenant_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    credentials: Optional[Dict[str, Any]] = None,
    **kwargs,
) -> str:
    """
    In-house multi-channel authentication tool for customer support (WhatsApp & Email).
    Generates, pre-verifies on WhatsApp via onWhatsApp(), sends, and verifies OTPs directly in the conversation.
    """
    clean_action = (action or "").strip().lower()

    # Smart identifier resolution: detect if phone was passed as email or vice-versa
    clean_phone = phone.strip() if phone and str(phone).strip() else None
    clean_email = email.strip().lower() if email and str(email).strip() else None

    if clean_email and "@" not in clean_email and any(c.isdigit() for c in clean_email):
        # Passed a phone number inside the email argument
        clean_phone = clean_email
        clean_email = None

    if not clean_phone and not clean_email:
        return "Error: A valid 'email' address or 'phone' number is required for authentication."

    channel = "whatsapp" if clean_phone else "email"

    # ── ACTION 1: SEND OTP ──
    if clean_action == "send_otp":
        if channel == "whatsapp":
            try:
                # 1. Pre-verify if number exists on WhatsApp via Baileys sock.onWhatsApp()
                async with httpx.AsyncClient(timeout=15.0) as client:
                    check_res = await client.post(
                        f"{settings.BACKEND_URL}/internal/whatsapp/check",
                        json={
                            "tenantId": tenant_id,
                            "phone": clean_phone,
                        },
                        headers=_HEADERS(),
                    )

                    if not check_res.is_success:
                        err_text = check_res.text
                        if "does not have an active connected WhatsApp session" in err_text or "Connect first" in err_text:
                            return (
                                f"Notice: WhatsApp integration is currently not connected for tenant '{tenant_id}'. "
                                f"Please instruct the user to provide their registered email address instead to receive the OTP via email."
                            )
                        return f"Error checking WhatsApp registration: {err_text}"

                    check_data = check_res.json()
                    results = check_data.get("results", [])
                    on_wa = any(r.get("exists") for r in results) if results else False

                    if not on_wa:
                        return (
                            f"The phone number '{clean_phone}' is not registered on WhatsApp. "
                            f"Please ask the user to provide a valid WhatsApp-registered phone number, or provide your registered email address instead."
                        )

                # 2. Number exists on WhatsApp! Generate and store OTP in backend
                async with httpx.AsyncClient(timeout=10.0) as client:
                    gen_res = await client.post(
                        f"{settings.BACKEND_URL}/internal/otp/generate",
                        json={
                            "tenantId": tenant_id,
                            "phone": clean_phone,
                            "channel": "whatsapp",
                            "conversationId": conversation_id,
                            "expiresInMinutes": 10,
                        },
                        headers=_HEADERS(),
                    )
                    if not gen_res.is_success:
                        return f"Error: Failed to generate verification code: {gen_res.text}"

                    gen_data = gen_res.json()
                    generated_otp = gen_data.get("otpCode")

                if not generated_otp:
                    return "Error: Backend did not return an OTP code."

                # 3. Dispatch OTP via WhatsApp
                wa_msg = (
                    f"Your 6-digit verification code is: {generated_otp}\n\n"
                    f"This code is valid for 10 minutes. Please enter it into the chat to verify your identity.\n"
                    f"If you did not request this code, you can safely ignore this message."
                )

                async with httpx.AsyncClient(timeout=15.0) as client:
                    send_res = await client.post(
                        f"{settings.BACKEND_URL}/internal/whatsapp/send",
                        json={
                            "tenantId": tenant_id,
                            "to": clean_phone,
                            "message": wa_msg,
                        },
                        headers=_HEADERS(),
                    )
                    if not send_res.is_success:
                        return f"Error sending verification message via WhatsApp: {send_res.text}"

                return (
                    f"Successfully sent a 6-digit verification code to WhatsApp number '{clean_phone}'. "
                    f"Instruct the user to check their WhatsApp and reply in this chat with the 6-digit code."
                )

            except Exception as e:
                return f"Error during WhatsApp OTP dispatch: {str(e)}"

        else:
            # ── EMAIL DISPATCH (GMAIL) ──
            try:
                # 1. Request backend to generate and persist OTP
                async with httpx.AsyncClient(timeout=10.0) as client:
                    res = await client.post(
                        f"{settings.BACKEND_URL}/internal/otp/generate",
                        json={
                            "tenantId": tenant_id,
                            "email": clean_email,
                            "channel": "email",
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

        clean_code = str(otp_code).strip()

        payload = {
            "tenantId": tenant_id,
            "otpCode": clean_code,
            "conversationId": conversation_id,
        }
        if clean_phone:
            payload["phone"] = clean_phone
        if clean_email:
            payload["email"] = clean_email

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{settings.BACKEND_URL}/internal/otp/verify",
                    json=payload,
                    headers=_HEADERS(),
                )
                if not res.is_success:
                    return f"Error verifying OTP with backend: {res.text}"

                result_data = res.json()

            target_display = clean_phone or clean_email
            if result_data.get("verified"):
                channel_name = "WhatsApp" if clean_phone else "Email"
                return (
                    f"Verification SUCCESSFUL. User with {channel_name} '{target_display}' is now fully authenticated. "
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
