"""Training script for PitchAdapter.

Self-supervised training from the pipeline's own outputs. Uses
high-quality RMVPE F0 as pseudo-labels for the adapter.

Loss: weighted L1 on F0 + BCE on voiced mask + smoothness regularization.

Usage:
    python -m airi_singing_worker.adapters.train_pitch_adapter \
        --data-dir /path/to/training_data \
        --output /path/to/pitch_adapter.pt \
        --epochs 100
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

from .pitch_adapter import PitchAdapter


class F0Dataset(Dataset):
    """Dataset of F0 contours with auxiliary features.

    Expects data_dir to contain .npz files with keys:
      raw_f0, voiced_prob, energy, spectral_flux, target_f0, target_voiced
    """

    def __init__(self, data_dir: str, max_len: int = 1000):
        self.files = sorted(Path(data_dir).glob("*.npz"))
        self.max_len = max_len
        if not self.files:
            raise ValueError(f"No .npz files found in {data_dir}")

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        data = np.load(str(self.files[idx]))
        raw_f0 = data["raw_f0"].astype(np.float32)
        voiced_prob = data["voiced_prob"].astype(np.float32)
        energy = data["energy"].astype(np.float32)
        spectral_flux = data["spectral_flux"].astype(np.float32)
        target_f0 = data["target_f0"].astype(np.float32)
        target_voiced = data["target_voiced"].astype(np.float32)

        # Truncate/pad to max_len
        t = min(len(raw_f0), self.max_len)
        def _pad(arr: np.ndarray) -> np.ndarray:
            if len(arr) >= self.max_len:
                return arr[:self.max_len]
            return np.pad(arr, (0, self.max_len - len(arr)))

        return {
            "features": torch.from_numpy(np.stack([
                _pad(raw_f0), _pad(voiced_prob), _pad(energy), _pad(spectral_flux),
            ])),
            "target_f0": torch.from_numpy(_pad(target_f0)),
            "target_voiced": torch.from_numpy(_pad(target_voiced)),
            "length": torch.tensor(t, dtype=torch.long),
        }


def smoothness_loss(f0: torch.Tensor) -> torch.Tensor:
    """Penalize frame-to-frame jitter in F0 (1st-order difference)."""
    diff = f0[:, 1:] - f0[:, :-1]
    return torch.mean(diff ** 2)


def train(
    data_dir: str,
    output_path: str,
    epochs: int = 100,
    batch_size: int = 32,
    lr: float = 1e-3,
    device: str = "cpu",
) -> None:
    """Train the PitchAdapter model."""
    dataset = F0Dataset(data_dir)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True, num_workers=0)

    model = PitchAdapter().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    f0_criterion = nn.L1Loss()
    voiced_criterion = nn.BCELoss()

    for epoch in range(epochs):
        model.train()
        total_loss = 0.0

        for batch in loader:
            features = batch["features"].to(device)
            target_f0 = batch["target_f0"].to(device)
            target_voiced = batch["target_voiced"].to(device)

            refined_f0, voiced_mask, _confidence = model(features)

            # Weighted losses
            loss_f0 = f0_criterion(refined_f0, target_f0)
            loss_voiced = voiced_criterion(voiced_mask, target_voiced)
            loss_smooth = smoothness_loss(refined_f0)

            loss = loss_f0 + 0.5 * loss_voiced + 0.01 * loss_smooth

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            total_loss += loss.item()

        scheduler.step()
        avg_loss = total_loss / max(len(loader), 1)

        if (epoch + 1) % 10 == 0 or epoch == 0:
            print(f"Epoch {epoch + 1}/{epochs}, loss={avg_loss:.4f}", flush=True)

    os.makedirs(str(Path(output_path).parent), exist_ok=True)
    torch.save(model.state_dict(), output_path)
    print(f"PitchAdapter saved to {output_path}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train PitchAdapter")
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    args = parser.parse_args()

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    train(args.data_dir, args.output, args.epochs, args.batch_size, args.lr, dev)
