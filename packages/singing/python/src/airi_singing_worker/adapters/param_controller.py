"""ParamController: learned RVC parameter prediction.

A small MLP (~100K params) that replaces rule-based formulas in
param_predictor.py. Learns the mapping from source audio features
to optimal RVC inference parameters.

Input:  source feature vector (f0 stats, dynamic range, sibilance,
        spectral flatness, bleed score, speaker embedding similarity)
Output: pitch_shift, index_rate, protect, rms_mix_rate
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn


# Clamping ranges for each output parameter
_PARAM_RANGES = {
    "pitch_shift": (-4, 4),
    "index_rate": (0.10, 0.82),
    "protect": (0.10, 0.50),
    "rms_mix_rate": (0.05, 0.80),
}


@dataclass
class ControllerOutput:
    pitch_shift: int
    index_rate: float
    protect: float
    rms_mix_rate: float


class ParamController(nn.Module):
    """3-layer MLP for RVC parameter prediction.

    Input features (dim=10):
      f0_median, f0_p10, f0_p90, f0_max, f0_min,
      dynamic_range, sibilance_score, spectral_flatness,
      bleed_score, speaker_similarity
    """

    def __init__(self, in_features: int = 10, hidden: int = 128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_features, hidden),
            nn.LayerNorm(hidden),
            nn.GELU(),
            nn.Linear(hidden, hidden),
            nn.LayerNorm(hidden),
            nn.GELU(),
            nn.Linear(hidden, 4),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Args:
            x: (batch, in_features)

        Returns:
            (batch, 4) — raw parameter predictions (pre-clamping):
            [pitch_shift, index_rate, protect, rms_mix_rate]
        """
        return self.net(x)


def load_param_controller(
    device: str = "cpu",
    weights_path: str | None = None,
) -> ParamController:
    """Load ParamController from checkpoint. Errors if weights missing."""
    path = weights_path or os.environ.get("PARAM_CONTROLLER_PATH", "")
    if not path or not Path(path).exists():
        raise RuntimeError(
            "ParamController weights not found. Set PARAM_CONTROLLER_PATH env var "
            f"or provide weights_path. Got: {path!r}"
        )

    model = ParamController()
    state = torch.load(path, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model = model.to(device)
    model.eval()
    return model


def predict_params(
    features: np.ndarray,
    controller: ParamController,
    device: str = "cpu",
) -> ControllerOutput:
    """Predict RVC parameters from source feature vector.

    Args:
        features: 1-D array of shape (10,) containing source audio features.
        controller: Loaded ParamController model.
        device: Inference device.

    Returns:
        ControllerOutput with clamped parameter values.
    """
    x = torch.from_numpy(features.astype(np.float32)).unsqueeze(0).to(device)

    with torch.no_grad():
        raw = controller(x).squeeze(0).cpu().numpy()

    ps_lo, ps_hi = _PARAM_RANGES["pitch_shift"]
    ir_lo, ir_hi = _PARAM_RANGES["index_rate"]
    pr_lo, pr_hi = _PARAM_RANGES["protect"]
    rm_lo, rm_hi = _PARAM_RANGES["rms_mix_rate"]

    return ControllerOutput(
        pitch_shift=int(np.clip(np.round(raw[0]), ps_lo, ps_hi)),
        index_rate=float(np.clip(raw[1], ir_lo, ir_hi)),
        protect=float(np.clip(raw[2], pr_lo, pr_hi)),
        rms_mix_rate=float(np.clip(raw[3], rm_lo, rm_hi)),
    )
