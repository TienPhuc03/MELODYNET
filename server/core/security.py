from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any


class SecurityError(ValueError):
    """Raised when a token or password payload is invalid."""


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


class PasswordHasher:
    algorithm = "pbkdf2_sha256"
    iterations = 120_000
    salt_bytes = 16
    key_bytes = 32

    @classmethod
    def hash_password(cls, password: str) -> str:
        salt = secrets.token_bytes(cls.salt_bytes)
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            cls.iterations,
            dklen=cls.key_bytes,
        )
        return "$".join(
            [
                cls.algorithm,
                str(cls.iterations),
                _b64url_encode(salt),
                _b64url_encode(derived),
            ]
        )

    @classmethod
    def verify_password(cls, password: str, stored_hash: str) -> bool:
        try:
            algorithm, iterations, salt_b64, hash_b64 = stored_hash.split("$", 3)
            if algorithm != cls.algorithm:
                return False
            salt = _b64url_decode(salt_b64)
            expected = _b64url_decode(hash_b64)
            actual = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode("utf-8"),
                salt,
                int(iterations),
                dklen=len(expected),
            )
            return hmac.compare_digest(actual, expected)
        except (ValueError, TypeError, IndexError, base64.binascii.Error):
            return False


@dataclass(slots=True)
class TokenManager:
    secret: bytes
    issuer: str = "melodynet"
    token_lifetime_seconds: int = 3600

    @classmethod
    def from_env(cls) -> "TokenManager":
        secret = os.getenv("JWT_SECRET", "melodynet-dev-secret").encode("utf-8")
        issuer = os.getenv("JWT_ISSUER", "melodynet")
        token_lifetime_seconds = int(os.getenv("JWT_EXPIRES_SECONDS", "3600"))
        return cls(secret=secret, issuer=issuer, token_lifetime_seconds=token_lifetime_seconds)

    def create_access_token(self, subject: str, extra_claims: dict[str, Any] | None = None) -> str:
        now = int(time.time())
        payload: dict[str, Any] = {
            "sub": subject,
            "iss": self.issuer,
            "iat": now,
            "exp": now + self.token_lifetime_seconds,
            "token_type": "access",
        }
        if extra_claims:
            payload.update(extra_claims)
        return self._encode(payload)

    def decode_access_token(self, token: str) -> dict[str, Any]:
        try:
            header_b64, payload_b64, signature_b64 = token.split(".")
        except ValueError as exc:
            raise SecurityError("Token format is invalid.") from exc

        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected_signature = hmac.new(self.secret, signing_input, hashlib.sha256).digest()
        received_signature = _b64url_decode(signature_b64)

        if not hmac.compare_digest(expected_signature, received_signature):
            raise SecurityError("Token signature is invalid.")

        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise SecurityError("Token has expired.")
        if payload.get("iss") != self.issuer:
            raise SecurityError("Token issuer is invalid.")
        if payload.get("token_type") != "access":
            raise SecurityError("Token type is invalid.")
        return payload

    def _encode(self, payload: dict[str, Any]) -> str:
        header = {"alg": "HS256", "typ": "JWT"}
        header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        signature = hmac.new(self.secret, signing_input, hashlib.sha256).digest()
        return f"{header_b64}.{payload_b64}.{_b64url_encode(signature)}"

