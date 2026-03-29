"""Backend-specific error classes."""

from .base import SingingWorkerError


class SeparationError(SingingWorkerError):
    """Error during vocal/accompaniment separation."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="SEPARATION_FAILED")


class PitchExtractionError(SingingWorkerError):
    """Error during F0 pitch extraction."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="PITCH_EXTRACTION_FAILED")


class ConversionError(SingingWorkerError):
    """Error during voice conversion."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="CONVERSION_FAILED")


class MixError(SingingWorkerError):
    """Error during audio mixing/post-processing."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="MIX_FAILED")
