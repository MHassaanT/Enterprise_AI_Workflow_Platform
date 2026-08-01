"""
Credentials Manager — AES-256-GCM encryption/decryption & RLS context switching.
"""
import json
import os
from typing import Dict, Any, Optional
import asyncpg
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
    Fetches and decrypts tool credentials for a binding or tool_id with strict RLS context switching.
    Executes SET LOCAL app.tenant_id within a database transaction.
    """
    db_url = settings.DATABASE_URL
    try:
        conn = await asyncpg.connect(db_url)
        try:
            async with conn.transaction():
                # Enforce Row-Level Security
                await conn.execute(f"SET LOCAL app.tenant_id = '{tenant_id}'")
                row = await conn.fetchrow(
                    """
                    SELECT encrypted_payload, auth_type 
                    FROM tool_credentials 
                    WHERE tenant_id = $1 AND (
                        (binding_id = $2 AND $2 IS NOT NULL) OR
                        (tool_id = $3 AND $3 IS NOT NULL)
                    )
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """,
                    tenant_id,
                    binding_id,
                    tool_id,
                )
                if not row:
                    return {}
                payload = decrypt_credentials(row["encrypted_payload"])
                payload["_auth_type"] = row["auth_type"]
                return payload
        finally:
            await conn.close()
    except Exception as e:
        print(f"[CREDENTIALS MANAGER WARNING] DB fetch failed: {e}. Returning empty credentials.")
        return {}
