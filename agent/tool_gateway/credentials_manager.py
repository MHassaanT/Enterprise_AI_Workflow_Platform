"""
Credentials Manager — AES-256-GCM encryption/decryption & HTTP-based credential fetch.

Fetches encrypted credentials via the Node.js backend's internal API
(never connects directly to Postgres — keeps tenant isolation in one place).
"""
import json
import os
from typing import Dict, Any, Optional
import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config import settings


def _get_aes_key(secret_key: Optional[str] = None) -> bytes:
    key_str = secret_key or settings.ENCRYPTION_KEY
    # If hex string of length 64 (32 bytes)
    if len(key_str) == 64:
        try:
            return bytes.fromhex(key_str)
        except ValueError:
            pass
    key_bytes = key_str.encode("utf-8")
    if len(key_bytes) < 32:
        return key_bytes.ljust(32, b"\0")
    return key_bytes[:32]


def encrypt_credentials(payload: Dict[str, Any], secret_key: Optional[str] = None) -> str:
    """
    Encrypts a dict payload into a format of `nonce_hex:ciphertext_hex` using AES-256-GCM.
    """
    key = _get_aes_key(secret_key)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    data = json.dumps(payload).encode("utf-8")
    ciphertext = aesgcm.encrypt(nonce, data, None)
    return f"{nonce.hex()}:{ciphertext.hex()}"


def decrypt_credentials(encrypted_text: str, secret_key: Optional[str] = None) -> Dict[str, Any]:
    """
    Decrypts a `nonce_hex:ciphertext_hex` payload back into a dictionary.
    """
    if not encrypted_text:
        return {}
    key = _get_aes_key(secret_key)
    aesgcm = AESGCM(key)
    parts = encrypted_text.split(":")
    if len(parts) != 2:
        raise ValueError("Invalid encrypted payload format. Expected 'nonce_hex:ciphertext_hex'.")
    nonce = bytes.fromhex(parts[0])
    ciphertext = bytes.fromhex(parts[1])
    decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, None)
    return json.loads(decrypted_bytes.decode("utf-8"))


async def fetch_tool_credentials(
    tenant_id: str,
    binding_id: Optional[str] = None,
    tool_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetches and decrypts tool credentials via the Node.js backend's internal API.
    This avoids direct Postgres connections from the agent service, which fail
    on Railway/cloud deployments where localhost DB is unreachable.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{settings.BACKEND_URL}/internal/credentials",
                json={
                    "tenantId": tenant_id,
                    "bindingId": binding_id,
                    "toolId": tool_id,
                },
                headers={"X-Internal-Token": settings.INTERNAL_SERVICE_TOKEN},
            )
            response.raise_for_status()
            data = response.json()

            encrypted_payload = data.get("encrypted_payload")
            if not encrypted_payload:
                print(f"[CREDENTIALS MANAGER] No credentials found for tenant={tenant_id}, binding={binding_id}, tool={tool_id}")
                return {}

            payload = decrypt_credentials(encrypted_payload)
            payload["_auth_type"] = data.get("auth_type")
            return payload

    except Exception as e:
        print(f"[CREDENTIALS MANAGER ERROR] Failed to fetch credentials via backend: {e}")
        return {}
