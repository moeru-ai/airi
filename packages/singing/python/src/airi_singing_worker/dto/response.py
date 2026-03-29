"""Response DTOs for the singing worker."""

from dataclasses import dataclass, field
from typing import Dict, Optional


@dataclass
class StageResponse:
    """Response from a single pipeline stage."""

    stage: str
    success: bool
    duration_ms: float
    artifacts: Dict[str, str] = field(default_factory=dict)
    error: Optional[str] = None


@dataclass
class CoverResponse:
    """Response from the complete cover pipeline."""

    success: bool
    stages: list["StageResponse"] = field(default_factory=list)
    manifest_path: Optional[str] = None
    error: Optional[str] = None
