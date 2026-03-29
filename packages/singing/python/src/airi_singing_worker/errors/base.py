"""Base error classes for the singing worker."""


class SingingWorkerError(Exception):
    """Base exception for all singing worker errors."""

    def __init__(self, message: str, code: str = "UNKNOWN") -> None:
        super().__init__(message)
        self.code = code
