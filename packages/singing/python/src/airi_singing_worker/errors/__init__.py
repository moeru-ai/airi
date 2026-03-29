"""Error types for the singing worker."""

from .base import SingingWorkerError
from .backend import ConversionError, MixError, PitchExtractionError, SeparationError

__all__ = [
    "SingingWorkerError",
    "SeparationError",
    "PitchExtractionError",
    "ConversionError",
    "MixError",
]
