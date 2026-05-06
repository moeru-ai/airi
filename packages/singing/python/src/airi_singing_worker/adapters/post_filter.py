"""PostFilter: neural mel-space refinement network.

A lightweight 1D conv U-Net (~1M params) that refines the mel spectrogram
of RVC output. Targets high-frequency detail restoration, metallic artifact
removal, and transient sharpening.

Input:  mel spectrogram of RVC output (n_mels, time)
Output: refined mel spectrogram (n_mels, time)
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn


class ConvBlock(nn.Module):
    """Double 1D conv block with layer norm and GELU."""

    def __init__(self, in_ch: int, out_ch: int, kernel_size: int = 5):
        super().__init__()
        pad = kernel_size // 2
        self.net = nn.Sequential(
            nn.Conv1d(in_ch, out_ch, kernel_size, padding=pad),
            nn.GELU(),
            nn.Conv1d(out_ch, out_ch, kernel_size, padding=pad),
            nn.GELU(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class PostFilter(nn.Module):
    """4-layer 1D Conv U-Net with skip connections for mel refinement.

    Encoder: 80 -> 128 -> 256 -> 512 -> 512
    Decoder: 512 -> 256 -> 128 -> 80
    Each encoder level halves temporal resolution, decoder doubles it back.
    """

    def __init__(self, n_mels: int = 80):
        super().__init__()
        self.n_mels = n_mels

        self.enc1 = ConvBlock(n_mels, 128)
        self.enc2 = ConvBlock(128, 256)
        self.enc3 = ConvBlock(256, 512)

        self.bottleneck = ConvBlock(512, 512)

        self.dec3 = ConvBlock(512 + 512, 256)
        self.dec2 = ConvBlock(256 + 256, 128)
        self.dec1 = ConvBlock(128 + 128, n_mels)

        self.pool = nn.AvgPool1d(2)

        # Residual connection: output = input + delta
        self.output_scale = nn.Parameter(torch.zeros(1))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass.

        Args:
            x: (batch, n_mels, time) mel spectrogram

        Returns:
            refined mel spectrogram (batch, n_mels, time)
        """
        # Pad time to be divisible by 8
        orig_t = x.shape[-1]
        pad_t = (8 - orig_t % 8) % 8
        if pad_t > 0:
            x = nn.functional.pad(x, (0, pad_t))

        # Encoder
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))

        # Bottleneck
        b = self.bottleneck(self.pool(e3))

        # Decoder with skip connections
        d3 = self.dec3(torch.cat([
            nn.functional.interpolate(b, size=e3.shape[-1], mode="nearest"),
            e3,
        ], dim=1))
        d2 = self.dec2(torch.cat([
            nn.functional.interpolate(d3, size=e2.shape[-1], mode="nearest"),
            e2,
        ], dim=1))
        d1 = self.dec1(torch.cat([
            nn.functional.interpolate(d2, size=e1.shape[-1], mode="nearest"),
            e1,
        ], dim=1))

        # Residual: start with zero contribution, learn the delta
        out = x + self.output_scale * d1

        # Remove padding
        if pad_t > 0:
            out = out[..., :orig_t]

        return out


def load_post_filter(
    device: str = "cpu",
    weights_path: str | None = None,
    n_mels: int = 80,
) -> PostFilter:
    """Load PostFilter from checkpoint. Errors if weights missing."""
    path = weights_path or os.environ.get("POST_FILTER_PATH", "")
    if not path or not Path(path).exists():
        raise RuntimeError(
            "PostFilter weights not found. Set POST_FILTER_PATH env var "
            f"or provide weights_path. Got: {path!r}"
        )

    model = PostFilter(n_mels=n_mels)
    state = torch.load(path, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model = model.to(device)
    model.eval()
    return model


def apply_post_filter(
    mel: np.ndarray,
    post_filter: PostFilter,
    device: str = "cpu",
) -> np.ndarray:
    """Apply PostFilter to refine a mel spectrogram.

    Args:
        mel: (n_mels, time) mel spectrogram as numpy array.
        post_filter: Loaded PostFilter model.
        device: Inference device.

    Returns:
        Refined mel spectrogram as numpy array (n_mels, time).
    """
    x = torch.from_numpy(mel.astype(np.float32)).unsqueeze(0).to(device)

    with torch.no_grad():
        refined = post_filter(x)

    return refined.squeeze(0).cpu().numpy()
