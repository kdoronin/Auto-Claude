"""
GitHub Security Infrastructure
==============================

Security components for the autonomous PR review system:
- InputSanitizer: Sanitizes untrusted inputs (prompt injection, path traversal, Unicode)
- PermissionManager: Authorization checks against allowlist
"""

from __future__ import annotations

from .input_sanitizer import InputSanitizer, SanitizeResult

__all__ = [
    "InputSanitizer",
    "SanitizeResult",
]
