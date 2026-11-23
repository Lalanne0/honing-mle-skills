"""Typed errors for LLM calls. Callers catch the most specific one they can handle.

Messages never include the API key or the gateway's response body.
"""


class LLMError(Exception):
    """Any failure to get a usable reply from the model."""


class LLMSchemaError(LLMError):
    """The reply failed validation twice: once, then again after a retry carrying the error."""


class LLMTruncatedError(LLMError):
    """The reply hit the token limit before it was complete. Not retried."""


class LLMRefusalError(LLMError):
    """The model refused to answer. Not retried."""


class LLMRateLimitedError(LLMError):
    """The gateway answered 429."""

    def __init__(self, message: str, retry_after: float | None) -> None:
        super().__init__(message)
        self.retry_after = retry_after
        """Seconds to wait before trying again, when the gateway said so."""


class LLMUpstreamError(LLMError):
    """The gateway answered 5xx."""


class LLMUnavailableError(LLMError):
    """The gateway could not be reached, or did not answer in time."""


class LLMConfigError(LLMError):
    """The gateway rejected our credentials (401 or 403). Check backend/.env."""
