"""Training script for PostFilter.

Teacher-student training where:
  - Teacher: high-quality reference vocals (or BigVGAN re-synthesis)
  - Student: current pipeline RVC output

Loss: multi-resolution STFT loss + perceptual (mel) loss.

Usage:
    python -m airi_singing_worker.adapters.train_post_filter \
        --data-dir /path/to/mel_pairs \
        --output /path/to/post_filter.pt \
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

from .post_filter import PostFilter


class MelPairDataset(Dataset):
    """Dataset of (degraded_mel, target_mel) pairs.

    Expects data_dir to contain .npz files with keys:
      degraded: (n_mels, time) mel spectrogram from RVC output
      target: (n_mels, time) mel spectrogram from reference
    """

    def __init__(self, data_dir: str, max_len: int = 500):
        self.files = sorted(Path(data_dir).glob("*.npz"))
        self.max_len = max_len
        if not self.files:
            raise ValueError(f"No .npz files found in {data_dir}")

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        data = np.load(str(self.files[idx]))
        degraded = data["degraded"].astype(np.float32)
        target = data["target"].astype(np.float32)

        # Truncate/pad time dimension to max_len
        n_mels = degraded.shape[0]
        t = min(degraded.shape[1], target.shape[1], self.max_len)

        def _pad_mel(mel: np.ndarray) -> np.ndarray:
            if mel.shape[1] >= self.max_len:
                return mel[:, :self.max_len]
            pad_width = self.max_len - mel.shape[1]
            return np.pad(mel, ((0, 0), (0, pad_width)))

        return (
            torch.from_numpy(_pad_mel(degraded)),
            torch.from_numpy(_pad_mel(target)),
        )


class MultiResolutionSTFTLoss(nn.Module):
    """Sum of L1 losses on magnitude spectrograms at multiple resolutions."""

    def __init__(self, fft_sizes: list[int] | None = None):
        super().__init__()
        self.fft_sizes = fft_sizes or [512, 1024, 2048]

    def forward(self, pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        loss = torch.tensor(0.0, device=pred.device)
        for n_fft in self.fft_sizes:
            # Flatten to 1D per batch element
            p_flat = pred.reshape(pred.shape[0], -1)
            t_flat = target.reshape(target.shape[0], -1)
            # Spectral magnitude comparison
            hop = n_fft // 4
            loss += nn.functional.l1_loss(
                torch.stft(p_flat, n_fft, hop_length=hop, return_complex=True).abs(),
                torch.stft(t_flat, n_fft, hop_length=hop, return_complex=True).abs(),
            )
        return loss / len(self.fft_sizes)


def train(
    data_dir: str,
    output_path: str,
    epochs: int = 100,
    batch_size: int = 16,
    lr: float = 5e-4,
    device: str = "cpu",
) -> None:
    """Train the PostFilter model."""
    dataset = MelPairDataset(data_dir)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True, num_workers=0)

    model = PostFilter().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    mel_criterion = nn.L1Loss()
    stft_criterion = MultiResolutionSTFTLoss()

    for epoch in range(epochs):
        model.train()
        total_loss = 0.0

        for degraded, target in loader:
            degraded = degraded.to(device)
            target = target.to(device)

            refined = model(degraded)

            loss_mel = mel_criterion(refined, target)
            loss_stft = stft_criterion(refined, target)

            loss = loss_mel + 0.5 * loss_stft

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
    print(f"PostFilter saved to {output_path}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train PostFilter")
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=5e-4)
    args = parser.parse_args()

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    train(args.data_dir, args.output, args.epochs, args.batch_size, args.lr, dev)
