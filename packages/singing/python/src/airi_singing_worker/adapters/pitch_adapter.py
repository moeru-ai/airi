"""PitchAdapter: learned F0 refinement network.

A small 1D convolutional sequence model (~500K params) that refines raw
RMVPE F0 output. Handles octave jump correction, voiced/unvoiced boundary
smoothing, vibrato preservation, glissando continuity, and jitter removal.

Input per frame:  [raw_f0, voiced_prob, energy, spectral_flux]
Output per frame: [refined_f0, voiced_mask, confidence]
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn


class ResidualConvBlock(nn.Module):
    """1D conv block with residual connection and layer norm."""

    def __init__(self, channels: int, kernel_size: int = 5):
        super().__init__()
        pad = kernel_size // 2
        self.conv = nn.Sequential(
            nn.Conv1d(channels, channels, kernel_size, padding=pad),
            nn.LayerNorm(channels),
            nn.GELU(),
            nn.Conv1d(channels, channels, kernel_size, padding=pad),
            nn.LayerNorm(channels),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, channels, time)
        # LayerNorm expects (batch, time, channels)
        residual = x
        out = x.transpose(1, 2)
        layers = list(self.conv)
        out = layers[0](x)  # Conv1d
        out = out.transpose(1, 2)  # -> (B, T, C)
        out = layers[1](out)  # LayerNorm
        out = out.transpose(1, 2)  # -> (B, C, T)
        out = layers[2](out)  # GELU
        out = layers[3](out)  # Conv1d
        out = out.transpose(1, 2)  # -> (B, T, C)
        out = layers[4](out)  # LayerNorm
        out = out.transpose(1, 2)  # -> (B, C, T)
        return out + residual


class PitchAdapter(nn.Module):
    """Lightweight 1D conv network for F0 refinement.

    Architecture:
      input_proj (4 -> hidden) -> 4x ResidualConvBlock -> 3 output heads
    """

    def __init__(self, in_channels: int = 4, hidden: int = 128, n_layers: int = 4):
        super().__init__()
        self.input_proj = nn.Conv1d(in_channels, hidden, 1)

        self.blocks = nn.ModuleList([
            ResidualConvBlock(hidden) for _ in range(n_layers)
        ])

        # f0_delta: additive correction to raw F0 (in Hz)
        self.f0_delta_head = nn.Conv1d(hidden, 1, 1)
        # voiced_gate: probability that frame is voiced
        self.voiced_head = nn.Conv1d(hidden, 1, 1)
        # confidence: per-frame confidence score
        self.confidence_head = nn.Conv1d(hidden, 1, 1)

    def forward(
        self, x: torch.Tensor,
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Forward pass.

        Args:
            x: (batch, 4, time) — [raw_f0, voiced_prob, energy, spectral_flux]

        Returns:
            refined_f0: (batch, time)
            voiced_mask: (batch, time) — sigmoid probability
            confidence: (batch, time) — sigmoid score
        """
        h = self.input_proj(x)
        for block in self.blocks:
            h = block(h)

        raw_f0 = x[:, 0, :]
        f0_delta = self.f0_delta_head(h).squeeze(1)
        refined_f0 = raw_f0 + f0_delta

        voiced_mask = torch.sigmoid(self.voiced_head(h).squeeze(1))
        confidence = torch.sigmoid(self.confidence_head(h).squeeze(1))

        return refined_f0, voiced_mask, confidence


def load_pitch_adapter(
    device: str = "cpu",
    weights_path: str | None = None,
) -> PitchAdapter:
    """Load PitchAdapter from checkpoint. Errors if weights are missing."""
    path = weights_path or os.environ.get("PITCH_ADAPTER_PATH", "")
    if not path or not Path(path).exists():
        raise RuntimeError(
            "PitchAdapter weights not found. Set PITCH_ADAPTER_PATH env var "
            f"or provide weights_path. Got: {path!r}"
        )

    model = PitchAdapter()
    state = torch.load(path, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model = model.to(device)
    model.eval()
    return model


def refine_f0(
    raw_f0: np.ndarray,
    voiced_prob: np.ndarray,
    energy: np.ndarray,
    spectral_flux: np.ndarray,
    adapter: PitchAdapter,
    device: str = "cpu",
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Apply PitchAdapter to refine F0 contour.

    Returns (refined_f0, voiced_mask, confidence) as numpy arrays.
    """
    features = np.stack([raw_f0, voiced_prob, energy, spectral_flux], axis=0)
    x = torch.from_numpy(features).float().unsqueeze(0).to(device)

    with torch.no_grad():
        f0_out, voiced_out, conf_out = adapter(x)

    return (
        f0_out.squeeze(0).cpu().numpy(),
        voiced_out.squeeze(0).cpu().numpy(),
        conf_out.squeeze(0).cpu().numpy(),
    )
