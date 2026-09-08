"""
Test Suite — authenticate_user_with_email Tool (Multi-Channel WhatsApp & Email)
Uses Python's standard library unittest and IsolatedAsyncioTestCase (no pytest dependency).
Validates:
- Pydantic input schema validation (email & phone)
- WhatsApp onWhatsApp() pre-check and message dispatch flow
- WhatsApp error handling (unregistered number, disconnected session)
- OTP generation & Gmail dispatch flow
- In-chat OTP verification logic (for both WhatsApp and Email)
- Registry integration, aliases, and LangChain StructuredTool binding
- Centralized Gateway execution
"""
import sys
import os
import unittest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tool_gateway.tools.authenticate_user_with_email import (
    AuthenticateUserWithEmailInput,
    authenticate_user_with_email_impl,
)
from tool_gateway.registry import (
    TOOL_REGISTRY,
    TOOL_INPUT_MODELS,
    BUILTIN_LANGCHAIN_TOOLS,
    get_tools_for_agent,
)
from tool_gateway.centralized_gateway import execute_mcp_tool


# ═══════════════════════════════════════════════════════════════════════════════
# 1. INPUT VALIDATION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestInputValidation(unittest.TestCase):
    def test_valid_email_send_otp_input(self):
        data = AuthenticateUserWithEmailInput(email="customer@example.com", action="send_otp")
        self.assertEqual(data.email, "customer@example.com")
        self.assertIsNone(data.phone)
        self.assertEqual(data.action, "send_otp")
        self.assertIsNone(data.otp_code)

    def test_valid_phone_send_otp_input(self):
        data = AuthenticateUserWithEmailInput(phone="+1234567890", action="send_otp")
        self.assertEqual(data.phone, "+1234567890")
        self.assertIsNone(data.email)
        self.assertEqual(data.action, "send_otp")

    def test_valid_verify_otp_input(self):
        data = AuthenticateUserWithEmailInput(
            email="customer@example.com",
            action="verify_otp",
            otp_code="123456",
        )
        self.assertEqual(data.otp_code, "123456")

    def test_invalid_action_rejected(self):
        with self.assertRaises(Exception):
            AuthenticateUserWithEmailInput(email="test@example.com", action="invalid_action")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. WHATSAPP OTP FLOW TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestWhatsAppOtpFlow(unittest.IsolatedAsyncioTestCase):
    async def test_send_otp_whatsapp_success(self):
        """When number exists on WhatsApp, generates OTP and dispatches WhatsApp message."""
        mock_check_res = MagicMock(is_success=True)
        mock_check_res.json.return_value = {
            "results": [{"jid": "1234567890@s.whatsapp.net", "exists": True}]
        }

        mock_gen_res = MagicMock(is_success=True)
        mock_gen_res.json.return_value = {
            "success": True,
            "otpCode": "789123",
            "expiresAt": "2026-09-08T20:00:00Z",
            "otpId": "otp-wa-1",
        }

        mock_send_res = MagicMock(is_success=True)
        mock_send_res.json.return_value = {
            "success": True,
            "messageId": "wa_msg_456",
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = [mock_check_res, mock_gen_res, mock_send_res]

            result = await authenticate_user_with_email_impl(
                phone="+1234567890",
                action="send_otp",
                tenant_id="tenant-wa",
                conversation_id="conv-wa-1",
            )

            self.assertIn("Successfully sent a 6-digit verification code to WhatsApp number '+1234567890'", result)
            self.assertEqual(mock_post.call_count, 3)
            # Check 1: internal/whatsapp/check
            self.assertIn("/internal/whatsapp/check", str(mock_post.call_args_list[0]))
            # Check 2: internal/otp/generate
            self.assertIn("/internal/otp/generate", str(mock_post.call_args_list[1]))
            # Check 3: internal/whatsapp/send
            self.assertIn("/internal/whatsapp/send", str(mock_post.call_args_list[2]))
            wa_body = mock_post.call_args_list[2][1]["json"]
            self.assertEqual(wa_body["to"], "+1234567890")
            self.assertIn("789123", wa_body["message"])

    async def test_send_otp_whatsapp_not_registered(self):
        """When number does not exist on WhatsApp, returns clean notice to provide email or active WA."""
        mock_check_res = MagicMock(is_success=True)
        mock_check_res.json.return_value = {
            "results": [{"jid": "1234567890@s.whatsapp.net", "exists": False}]
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_check_res):
            result = await authenticate_user_with_email_impl(
                phone="+1234567890",
                action="send_otp",
                tenant_id="tenant-wa",
            )

            self.assertIn("is not registered on WhatsApp", result)
            self.assertIn("+1234567890", result)
            self.assertIn("provide your registered email address instead", result)

    async def test_send_otp_whatsapp_disconnected_session(self):
        """When tenant WhatsApp session is not connected, informs user to provide email."""
        mock_check_res = MagicMock(is_success=False, status_code=500)
        mock_check_res.text = "Tenant 'tenant-wa' does not have an active connected WhatsApp session. Connect first."

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_check_res):
            result = await authenticate_user_with_email_impl(
                phone="+1234567890",
                action="send_otp",
                tenant_id="tenant-wa",
            )

            self.assertIn("WhatsApp integration is currently not connected", result)
            self.assertIn("provide their registered email address instead", result)

    async def test_verify_otp_whatsapp_success(self):
        """Verifies WhatsApp OTP successfully."""
        mock_verify_res = MagicMock(is_success=True)
        mock_verify_res.json.return_value = {
            "verified": True,
            "message": "Phone successfully verified.",
            "channel": "whatsapp",
            "phone": "+1234567890",
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_verify_res):
            result = await authenticate_user_with_email_impl(
                phone="+1234567890",
                action="verify_otp",
                otp_code="789123",
                tenant_id="tenant-wa",
            )

            self.assertIn("Verification SUCCESSFUL", result)
            self.assertIn("WhatsApp '+1234567890'", result)

    async def test_auto_detect_phone_passed_in_email_argument(self):
        """If phone number is passed into email parameter by model, auto-detects and uses WhatsApp."""
        mock_check_res = MagicMock(is_success=True)
        mock_check_res.json.return_value = {"results": [{"exists": False}]}

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_check_res):
            result = await authenticate_user_with_email_impl(
                email="+923001234567",
                action="send_otp",
                tenant_id="tenant-wa",
            )

            self.assertIn("is not registered on WhatsApp", result)
            self.assertIn("+923001234567", result)


# ═══════════════════════════════════════════════════════════════════════════════
# 3. EMAIL OTP FLOW TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestEmailSendOtpFlow(unittest.IsolatedAsyncioTestCase):
    async def test_send_otp_success_with_gmail(self):
        """When Gmail is connected, tool generates OTP via backend and sends email via Gmail."""
        mock_backend_res = MagicMock(is_success=True)
        mock_backend_res.json.return_value = {
            "success": True,
            "otpCode": "654321",
            "expiresAt": "2026-09-04T21:00:00Z",
            "otpId": "otp-uuid-1",
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_backend_res), \
             patch("tool_gateway.tools.authenticate_user_with_email.fetch_tool_credentials", new_callable=AsyncMock) as mock_creds, \
             patch("tool_gateway.tools.authenticate_user_with_email.execute_gmail_tool", new_callable=AsyncMock) as mock_gmail:

            mock_creds.return_value = {"access_token": "valid_oauth_token"}
            mock_gmail.return_value = "Successfully sent email to 'customer@example.com'. Message ID: msg123"

            result = await authenticate_user_with_email_impl(
                email="customer@example.com",
                action="send_otp",
                tenant_id="tenant-123",
                conversation_id="conv-456",
            )

            self.assertIn("Successfully sent a 6-digit verification code", result)
            self.assertIn("customer@example.com", result)
            mock_gmail.assert_called_once()
            args = mock_gmail.call_args[1]["arguments"]
            self.assertEqual(args["to"], "customer@example.com")
            self.assertIn("654321", args["body"])

    async def test_send_otp_without_gmail_returns_notice(self):
        """When tenant has not connected Gmail, returns a clear message with dev fallback code."""
        mock_backend_res = MagicMock(is_success=True)
        mock_backend_res.json.return_value = {
            "success": True,
            "otpCode": "999888",
            "expiresAt": "2026-09-04T21:00:00Z",
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_backend_res), \
             patch("tool_gateway.tools.authenticate_user_with_email.fetch_tool_credentials", new_callable=AsyncMock, return_value={}):

            result = await authenticate_user_with_email_impl(
                email="unconnected@example.com",
                action="send_otp",
                tenant_id="tenant-no-gmail",
            )

            self.assertIn("Gmail integration is not connected", result)
            self.assertIn("999888", result)

    async def test_verify_otp_email_success(self):
        mock_backend_res = MagicMock(is_success=True)
        mock_backend_res.json.return_value = {
            "verified": True,
            "message": "Email successfully verified.",
            "email": "customer@example.com",
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_backend_res):
            result = await authenticate_user_with_email_impl(
                email="customer@example.com",
                action="verify_otp",
                otp_code="654321",
                tenant_id="tenant-123",
            )

            self.assertIn("Verification SUCCESSFUL", result)
            self.assertIn("customer@example.com", result)

    async def test_missing_both_email_and_phone(self):
        result = await authenticate_user_with_email_impl(
            action="send_otp",
            tenant_id="tenant-123",
        )
        self.assertIn("A valid 'email' address or 'phone' number is required", result)


# ═══════════════════════════════════════════════════════════════════════════════
# 4. REGISTRY & GATEWAY ROUTING TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestRegistryAndGatewayIntegration(unittest.IsolatedAsyncioTestCase):
    def test_tool_registered_in_all_registries(self):
        self.assertIn("authenticate_user_with_email", TOOL_REGISTRY)
        self.assertIn("authenticate_user", TOOL_REGISTRY)
        self.assertIn("authenticate_user_with_email", TOOL_INPUT_MODELS)
        self.assertIn("authenticate_user", TOOL_INPUT_MODELS)
        self.assertIn("authenticate_user_with_email", BUILTIN_LANGCHAIN_TOOLS)
        self.assertIn("authenticate_user", BUILTIN_LANGCHAIN_TOOLS)

    async def test_tool_present_in_get_tools_for_agent(self):
        with patch("tool_gateway.registry.get_allowed_tool_bindings", new_callable=AsyncMock, return_value=[]):
            tools = await get_tools_for_agent("agent-test")
            tool_names = [t.name for t in tools]
            self.assertIn("authenticate_user_with_email", tool_names)

    async def test_centralized_gateway_execution(self):
        """Gateway routes authenticate_user_with_email and passes tenant & conversation metadata."""
        mock_backend_res = MagicMock(is_success=True)
        mock_backend_res.json.return_value = {
            "verified": True,
            "message": "Email successfully verified.",
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_backend_res), \
             patch("tool_gateway.centralized_gateway.get_allowed_tool_bindings", new_callable=AsyncMock, return_value=[]):

            result = await execute_mcp_tool(
                tenant_id="tenant-abc",
                agent_instance_id="agent-xyz",
                tool_name="authenticate_user_with_email",
                arguments={"email": "user@corp.com", "action": "verify_otp", "otp_code": "123456"},
                conversation_id="conv-123",
            )

            self.assertIn("Verification SUCCESSFUL", result)


if __name__ == "__main__":
    unittest.main()
