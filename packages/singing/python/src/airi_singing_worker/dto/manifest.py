"""Manifest DTO for pipeline audit trail."""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class ManifestData:
    """Data structure for the cover manifest (manifest.json)."""

    version: int = 1
    job_id: str = ""
    created_at: str = ""
    completed_at: str = ""
    separator: Dict[str, str] = field(default_factory=dict)
    pitch: Dict[str, str] = field(default_factory=dict)
    converter: Dict[str, Any] = field(default_factory=dict)
    mix: Dict[str, Any] = field(default_factory=dict)
    timing: Dict[str, float] = field(default_factory=dict)
    loudnorm: Optional[Dict[str, float]] = None
    output_sample_rate: int = 44100
