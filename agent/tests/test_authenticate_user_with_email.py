"""
Test Suite — authenticate_user_with_email Tool
Validates:
- Pydantic input schema validation
- OTP generation & Gmail dispatch flow
- In-chat OTP verification logic
- Registry integration & LangChain StructuredTool binding
- Centralized Gateway execution
"""
import sys
import os
import pytest
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

class TestInputValidation:
    def test_valid_send_otp_input(self):
        data = AuthenticateUserWithEmailInput(email="customer@example.com", action="send_otp")
        assert data.email == "customer@example.com"
        assert data.action == "send_otp"
        assert data.otp_code is None

    def test_valid_verify_otp_input(self):
        data = AuthenticateUserWithEmailInput(
            email="customer@example.com",
            action="verify_otp",
            otp_code="123456",
        )
        assert data.otp_code == "123456"

    def test_invalid_action_rejected(self):
        with pytest.raises(Exception):
            AuthenticateUserWithEmailInput(email="test@example.com", action="invalid_action")

    def test_missing_email_rejected(self):
        with pytest.raises(Exception):
            AuthenticateUserWithEmailInput(action="send_otp")


# ═══════════════════════════════════════════════════════════════════════════════
# 2. SEND OTP EXECUTION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestSendOtpFlow:
    @pytest.mark.asyncio
    async def test_send_otp_success_with_gmail(self):
        """When Gmail is connected, tool generates OTP via backend and sends email via Gmail."""
        mock_backend_res = MagicMock()
        mock_backend_res.is_success = True
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

            assert "Successfully sent a 6-digit verification code" in result
            assert "customer@example.com" in result
            mock_gmail.assert_called_once()
            args = mock_gmail.call_args[1]["arguments"]
            assert args["to"] == "customer@example.com"
            assert "654321" in args["body"]

    @pytest.mark.asyncio
    async def test_send_otp_without_gmail_returns_notice(self):
        """When tenant has not connected Gmail, returns a clear message with dev fallback code."""
        mock_backend_res = MagicMock()
        mock_backend_res.is_success = True
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

            assert "Gmail integration is not connected" in result
            assert "999888" in result

    @pytest.mark.asyncio
    async def test_send_otp_handles_gmail_error(self):
        """When Gmail API returns an error, tool reports the failure gracefully."""
        mock_backend_res = MagicMock()
        mock_backend_res.is_success = True
        mock_backend_res.json.return_value = {"success": True, "otpCode": "112233"}

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_backend_res), \
             patch("tool_gateway.tools.authenticate_user_with_email.fetch_tool_credentials", new_callable=AsyncMock, return_value={"access_token": "token"}), \
             patch("tool_gateway.tools.authenticate_user_with_email.execute_gmail_tool", new_callable=AsyncMock, return_value="Gmail API Error (403): Rate limit exceeded"):

            result = await authenticate_user_with_email_impl(
                email="error@example.com",
                action="send_otp",
                tenant_id="tenant-123",
            )

            assert "Error sending verification email via Gmail" in result


# ═══════════════════════════════════════════════════════════════════════════════
# 3. VERIFY OTP EXECUTION TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestVerifyOtpFlow:
    @pytest.mark.asyncio
    async def test_verify_otp_missing_code(self):
        result = await authenticate_user_with_email_impl(
            email="customer@example.com",
            action="verify_otp",
            otp_code="",
        )
        assert "Error: 'otp_code' is required" in result

    @pytest.mark.asyncio
    async def test_verify_otp_success(self):
        mock_backend_res = MagicMock()
        mock_backend_res.is_success = True
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
                conversation_id="conv-456",
            )

            assert "Verification SUCCESSFUL" in result
            assert "customer@example.com" in result

    @pytest.mark.asyncio
    async def test_verify_otp_failure_incorrect_code(self):
        mock_backend_res = MagicMock()
        mock_backend_res.is_success = True
        mock_backend_res.json.return_value = {
            "verified": False,
            "message": "Incorrect code. 2 attempt(s) remaining.",
            "remainingAttempts": 2,
        }

        with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_backend_res):
            result = await authenticate_user_with_email_impl(
                email="customer@example.com",
                action="verify_otp",
                otp_code="000000",
                tenant_id="tenant-123",
            )

            assert "Verification FAILED" in result
            assert "Remaining attempts: 2" in result


# ═══════════════════════════════════════════════════════════════════════════════
# 4. REGISTRY & GATEWAY ROUTING TESTS
# ═══════════════════════════════════════════════════════════════════════════════

class TestRegistryAndGatewayIntegration:
    def test_tool_registered_in_all_registries(self):
        assert "authenticate_user_with_email" in TOOL_REGISTRY
        assert "authenticate_user_with_email" in TOOL_INPUT_MODELS
        assert "authenticate_user_with_email" in BUILTIN_LANGCHAIN_TOOLS

    @pytest.mark.asyncio
    async def test_tool_present_in_get_tools_for_agent(self):
        with patch("tool_gateway.registry.get_allowed_tool_bindings", new_callable=AsyncMock, return_value=[]):
            tools = await get_tools_for_agent("agent-test")
            tool_names = [t.name for t in tools]
            assert "authenticate_user_with_email" in tool_names

    @pytest.mark.asyncio
    async def test_centralized_gateway_execution(self):
        """Gateway routes authenticate_user_with_email and passes tenant & conversation metadata."""
        mock_backend_res = MagicMock()
        mock_backend_res.is_success = True
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

            assert "Verification SUCCESSFUL" in result
