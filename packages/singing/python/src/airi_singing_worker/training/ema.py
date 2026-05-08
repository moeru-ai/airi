"""Exponential Moving Average (EMA) for generator weights.

EMA smooths model parameters over training steps to produce more stable
inference weights. The EMA model is never used during training itself;
only the checkpoint saved for inference uses EMA weights.

Formula: θ_ema = decay * θ_ema + (1 - decay) * θ_model

References:
  - Polyak averaging (Polyak & Juditsky, 1992)
  - lucidrains/ema-pytorch
  - BigVGAN, HiFi-GAN, VITS all benefit from EMA in practice
"""

from __future__ import annotations

import copy

import torch
import torch.nn as nn


class ExponentialMovingAverage:
    """Maintains an EMA shadow copy of a model's parameters."""

    def __init__(self, model: nn.Module, decay: float = 0.999) -> None:
        self.decay = decay
        self.shadow: dict[str, torch.Tensor] = {}
        self.backup: dict[str, torch.Tensor] = {}
        self._init_shadow(model)

    def _init_shadow(self, model: nn.Module) -> None:
        for name, param in model.named_parameters():
            if param.requires_grad:
                self.shadow[name] = param.data.clone()

    @torch.no_grad()
    def update(self, model: nn.Module) -> None:
        """Update shadow parameters with current model parameters."""
        for name, param in model.named_parameters():
            if param.requires_grad and name in self.shadow:
                self.shadow[name].mul_(self.decay).add_(
                    param.data, alpha=1.0 - self.decay
                )

    def apply_shadow(self, model: nn.Module) -> None:
        """Replace model parameters with EMA shadow (for inference/saving).

        Call restore() afterwards to revert to training weights.
        """
        self.backup.clear()
        for name, param in model.named_parameters():
            if param.requires_grad and name in self.shadow:
                self.backup[name] = param.data.clone()
                param.data.copy_(self.shadow[name])

    def restore(self, model: nn.Module) -> None:
        """Restore original training weights after apply_shadow()."""
        for name, param in model.named_parameters():
            if param.requires_grad and name in self.backup:
                param.data.copy_(self.backup[name])
        self.backup.clear()

    def release(self) -> None:
        """Free all GPU tensors held by EMA (shadow + backup)."""
        self.shadow.clear()
        self.backup.clear()

    def state_dict(self) -> dict[str, torch.Tensor]:
        return copy.deepcopy(self.shadow)

    def load_state_dict(self, state: dict[str, torch.Tensor]) -> None:
        self.shadow = copy.deepcopy(state)
