"""Training data loader for RVC v2 fine-tuning.

Loads preprocessed segments produced by the training pipeline:
  0_gt_wavs/*.wav    — ground-truth waveforms at target sample rate
  2a_f0/*.wav.npy    — coarse (quantized) F0
  2b_f0nsf/*.wav.npy — continuous F0 for NSF
  3_feature768/*.npy — HuBERT content features (768-dim)

Spectrograms are computed on-the-fly from the waveforms.
Supports optional GPU data caching for small datasets.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from torch.utils.data import Dataset

from .config import TrainingConfig
from .mel_processing import spectrogram_torch


class RVCTrainingDataset(Dataset):
    """Single-speaker dataset for RVC GAN fine-tuning.

    When cache_device is set to a CUDA device, all samples are preloaded
    into GPU memory on first access, eliminating per-batch I/O overhead.
    """

    def __init__(
        self,
        exp_dir: str,
        config: TrainingConfig,
        cache_device: str | None = None,
    ) -> None:
        self.cfg = config
        self.exp_dir = Path(exp_dir)
        self._alignment_checked = False
        self._cache_device = cache_device
        self._cache: list[dict[str, torch.Tensor]] | None = None

        gt_dir = self.exp_dir / "0_gt_wavs"
        feat_dir = self.exp_dir / "3_feature768"
        f0_dir = self.exp_dir / "2a_f0"
        f0nsf_dir = self.exp_dir / "2b_f0nsf"

        min_wav_samples = config.segment_size + config.hop_length
        skipped_short = 0

        self.samples: list[dict[str, Path]] = []
        for wav_path in sorted(gt_dir.glob("*.wav")):
            stem = wav_path.stem
            feat_path = feat_dir / f"{stem}.npy"
            f0_path = f0_dir / f"{stem}.wav.npy"
            f0nsf_path = f0nsf_dir / f"{stem}.wav.npy"

            if not (feat_path.exists() and f0_path.exists() and f0nsf_path.exists()):
                continue

            info = sf.info(str(wav_path))
            if info.frames < min_wav_samples:
                skipped_short += 1
                continue

            self.samples.append({
                "wav": wav_path,
                "feat": feat_path,
                "f0": f0_path,
                "f0nsf": f0nsf_path,
            })

        if skipped_short > 0:
            print(
                f"  Skipped {skipped_short} segments shorter than "
                f"{min_wav_samples} samples ({min_wav_samples / config.sampling_rate:.2f}s)",
                flush=True,
            )

        if not self.samples:
            raise RuntimeError(
                f"No valid training samples found in {exp_dir}. "
                f"All segments may be shorter than the required "
                f"{min_wav_samples / config.sampling_rate:.2f}s minimum. "
                "Try using a longer audio file or reducing segment_size."
            )

    def __len__(self) -> int:
        return len(self.samples)

    def _load_sample(self, idx: int) -> dict[str, torch.Tensor]:
        """Load and preprocess a single sample from disk."""
        s = self.samples[idx]

        wav, sr = sf.read(str(s["wav"]))
        if len(wav.shape) > 1:
            wav = wav.mean(axis=1)
        wav = torch.FloatTensor(wav)

        phone_raw = np.load(str(s["feat"]))
        # HuBERT features are at 50fps (16kHz / 320 hop).
        # Spec is at 100fps (40kHz / 400 hop).
        # Upstream RVC upsamples phone 2x to match spec frame rate.
        phone = torch.from_numpy(np.repeat(phone_raw, 2, axis=0)).float()

        pitch = torch.from_numpy(np.load(str(s["f0"]))).long()
        pitchf = torch.from_numpy(np.load(str(s["f0nsf"]))).float()

        spec = spectrogram_torch(
            wav.unsqueeze(0),
            self.cfg.filter_length,
            self.cfg.hop_length,
            self.cfg.win_length,
            center=False,
        ).squeeze(0)

        if not self._alignment_checked:
            self._alignment_checked = True
            spec_t = spec.shape[1]
            phone_t = phone.shape[0]
            pitch_t = pitch.shape[0]
            ratio_phone = phone_t / max(spec_t, 1)
            ratio_pitch = pitch_t / max(spec_t, 1)
            print(
                f"  Frame alignment check (sample 0): "
                f"spec={spec_t}, phone(2x)={phone_t}, pitch={pitch_t}, pitchf={pitchf.shape[0]} | "
                f"phone/spec={ratio_phone:.2f}, pitch/spec={ratio_pitch:.2f}",
                flush=True,
            )
            if abs(ratio_phone - 1.0) > 0.1:
                print(
                    f"  WARNING: phone/spec ratio {ratio_phone:.2f} deviates >10% from 1.0. "
                    "Check HuBERT extraction rate and 2x upsampling.",
                    flush=True,
                )
            if abs(ratio_pitch - 1.0) > 0.1:
                print(
                    f"  WARNING: pitch/spec ratio {ratio_pitch:.2f} deviates >10% from 1.0. "
                    "Check F0 extraction sample rate (should use 16kHz audio).",
                    flush=True,
                )

        n_frames = min(spec.shape[1], phone.shape[0], pitch.shape[0], pitchf.shape[0])
        n_frames = max(n_frames, self.cfg.segment_frames + 1)
        spec = spec[:, :n_frames]
        phone = phone[:n_frames] if phone.shape[0] >= n_frames else torch.nn.functional.pad(phone, (0, 0, 0, n_frames - phone.shape[0]))
        pitch = pitch[:n_frames] if pitch.shape[0] >= n_frames else torch.nn.functional.pad(pitch, (0, n_frames - pitch.shape[0]))
        pitchf = pitchf[:n_frames] if pitchf.shape[0] >= n_frames else torch.nn.functional.pad(pitchf, (0, n_frames - pitchf.shape[0]))
        if spec.shape[1] < n_frames:
            spec = torch.nn.functional.pad(spec, (0, n_frames - spec.shape[1]))
        wav = wav[: n_frames * self.cfg.hop_length]
        if wav.shape[0] < n_frames * self.cfg.hop_length:
            wav = torch.nn.functional.pad(wav, (0, n_frames * self.cfg.hop_length - wav.shape[0]))

        return {
            "phone": phone,
            "spec": spec,
            "wav": wav,
            "pitch": pitch,
            "pitchf": pitchf,
            "sid": torch.LongTensor([0]),
        }

    def _build_cache(self) -> None:
        """Preload all samples into GPU memory."""
        print(f"  Caching {len(self.samples)} samples to {self._cache_device}...", flush=True)
        self._cache = []
        for i in range(len(self.samples)):
            sample = self._load_sample(i)
            if self._cache_device:
                sample = {
                    k: v.to(self._cache_device) if isinstance(v, torch.Tensor) else v
                    for k, v in sample.items()
                }
            self._cache.append(sample)
        print(f"  GPU data cache ready ({len(self._cache)} samples)", flush=True)

    def release(self) -> None:
        """Free all GPU-cached tensors."""
        if self._cache is not None:
            self._cache.clear()
            self._cache = None

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        if self._cache_device and self._cache is None:
            self._build_cache()

        if self._cache is not None:
            return self._cache[idx]

        return self._load_sample(idx)


class RVCCollate:
    """Collate function that pads variable-length sequences to batch max."""

    def __call__(self, batch: list[dict[str, torch.Tensor]]) -> tuple:
        phone_lengths = torch.LongTensor([b["phone"].shape[0] for b in batch])
        wave_lengths = torch.LongTensor([b["wav"].shape[0] for b in batch])
        spec_lengths = torch.LongTensor([b["spec"].shape[1] for b in batch])

        max_phone = phone_lengths.max().item()
        max_spec = spec_lengths.max().item()
        max_wave = wave_lengths.max().item()
        spec_channels = batch[0]["spec"].shape[0]

        phone_padded = torch.zeros(len(batch), max_phone, batch[0]["phone"].shape[1])
        spec_padded = torch.zeros(len(batch), spec_channels, max_spec)
        wave_padded = torch.zeros(len(batch), 1, max_wave)
        pitch_padded = torch.zeros(len(batch), max_phone, dtype=torch.long)
        pitchf_padded = torch.zeros(len(batch), max_phone)
        sid = torch.LongTensor(len(batch))

        for i, b in enumerate(batch):
            plen = b["phone"].shape[0]
            slen = b["spec"].shape[1]
            wlen = b["wav"].shape[0]

            phone_padded[i, :plen] = b["phone"]
            spec_padded[i, :, :slen] = b["spec"]
            wave_padded[i, 0, :wlen] = b["wav"]
            pitch_padded[i, :plen] = b["pitch"][:plen]
            pitchf_padded[i, :plen] = b["pitchf"][:plen]
            sid[i] = b["sid"][0]

        return (
            phone_padded,
            phone_lengths,
            pitch_padded,
            pitchf_padded,
            spec_padded,
            spec_lengths,
            wave_padded,
            wave_lengths,
            sid,
        )
