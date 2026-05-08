"""Learning rate schedulers for RVC GAN training.

Implements Warmup + Cosine Annealing, which is superior to plain
ExponentialLR for long training runs:
  - Linear warmup prevents early instability from large gradients
  - Cosine decay avoids the hard plateaus of step decay
  - Optional warm restarts (SGDR) escape local minima

References:
  SGDR: Stochastic Gradient Descent with Warm Restarts (Loshchilov & Hutter, 2017)
  PyTorch CosineAnnealingWarmRestarts documentation
"""

from __future__ import annotations

import math

from torch.optim import Optimizer
from torch.optim.lr_scheduler import LRScheduler


class WarmupCosineAnnealingLR(LRScheduler):
    """Linear warmup followed by cosine annealing with optional warm restarts.

    During warmup (epoch < warmup_epochs):
        lr = lr_min + (lr_max - lr_min) * epoch / warmup_epochs

    After warmup:
        Cosine annealing from lr_max to lr_min over T_0 epochs,
        with optional T_mult for increasing cycle lengths.
    """

    def __init__(
        self,
        optimizer: Optimizer,
        warmup_epochs: int,
        t_0: int,
        t_mult: int = 1,
        lr_min: float = 1e-6,
        last_epoch: int = -1,
    ) -> None:
        self.warmup_epochs = warmup_epochs
        self.t_0 = max(t_0, 1)
        self.t_mult = t_mult
        self.lr_min = lr_min
        self._lr_max_values = [pg["lr"] for pg in optimizer.param_groups]
        super().__init__(optimizer, last_epoch)

    def get_lr(self) -> list[float]:
        epoch = self.last_epoch

        if epoch < self.warmup_epochs:
            alpha = epoch / max(self.warmup_epochs, 1)
            return [
                self.lr_min + (lr_max - self.lr_min) * alpha
                for lr_max in self._lr_max_values
            ]

        t = epoch - self.warmup_epochs

        if self.t_mult == 1:
            t_cur = t % self.t_0
            cos_frac = t_cur / self.t_0
        else:
            t_i = self.t_0
            t_cum = 0
            while t_cum + t_i <= t:
                t_cum += t_i
                t_i = int(t_i * self.t_mult)
            t_cur = t - t_cum
            cos_frac = t_cur / t_i

        cos_val = 0.5 * (1.0 + math.cos(math.pi * cos_frac))
        return [
            self.lr_min + (lr_max - self.lr_min) * cos_val
            for lr_max in self._lr_max_values
        ]
