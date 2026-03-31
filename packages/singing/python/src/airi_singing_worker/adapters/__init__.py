"""Learned adapters for the AI Cover pipeline.

Adapters are small neural networks placed at key information bottlenecks
to refine outputs that heuristic rules cannot handle reliably. They are
configured at the pipeline level with explicit modes:

- ``backbone``: Canonical backbone only, no adapters.
- ``full``: All adapters required, missing weights = startup error.
"""

from enum import Enum


class PipelineMode(Enum):
    BACKBONE = "backbone"
    FULL = "full"
