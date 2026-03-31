"""Training script for ParamController.

Uses offline parameter search results (grid/Bayesian) to train the MLP.
Each training sample is a (source_features, optimal_params) pair found
by searching for the parameter combination that maximizes a composite
quality metric (singer_similarity + f0_corr + naturalness_mos).

Usage:
    python -m airi_singing_worker.adapters.train_param_controller \
        --data-dir /path/to/param_search_results \
        --output /path/to/param_controller.pt \
        --epochs 200
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

from .param_controller import ParamController


class ParamDataset(Dataset):
    """Dataset of (source_features, optimal_params) pairs.

    Expects data_dir to contain .npz files with keys:
      features: (10,) source feature vector
      params: (4,) optimal [pitch_shift, index_rate, protect, rms_mix_rate]
    """

    def __init__(self, data_dir: str):
        self.files = sorted(Path(data_dir).glob("*.npz"))
        if not self.files:
            raise ValueError(f"No .npz files found in {data_dir}")

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        data = np.load(str(self.files[idx]))
        features = torch.from_numpy(data["features"].astype(np.float32))
        params = torch.from_numpy(data["params"].astype(np.float32))
        return features, params


def train(
    data_dir: str,
    output_path: str,
    epochs: int = 200,
    batch_size: int = 64,
    lr: float = 1e-3,
    device: str = "cpu",
) -> None:
    """Train the ParamController MLP."""
    dataset = ParamDataset(data_dir)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True, num_workers=0)

    model = ParamController().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    criterion = nn.MSELoss()

    for epoch in range(epochs):
        model.train()
        total_loss = 0.0

        for features, params in loader:
            features = features.to(device)
            params = params.to(device)

            pred = model(features)
            loss = criterion(pred, params)

            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

            total_loss += loss.item()

        scheduler.step()
        avg_loss = total_loss / max(len(loader), 1)

        if (epoch + 1) % 20 == 0 or epoch == 0:
            print(f"Epoch {epoch + 1}/{epochs}, loss={avg_loss:.6f}", flush=True)

    os.makedirs(str(Path(output_path).parent), exist_ok=True)
    torch.save(model.state_dict(), output_path)
    print(f"ParamController saved to {output_path}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train ParamController")
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--epochs", type=int, default=200)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    args = parser.parse_args()

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    train(args.data_dir, args.output, args.epochs, args.batch_size, args.lr, dev)
