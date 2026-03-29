"""Axis 3 — Melody Accuracy: F0 correlation, RMSE, semitone accuracy, VUV error.

Operates on F0 contour arrays (numpy). F0 extraction is handled externally
(e.g. RMVPE or CREPE via the existing pitch backend).
"""

from __future__ import annotations

import numpy as np
import soundfile as sf


def extract_f0_from_audio(audio_path: str, sr: int = 16000) -> np.ndarray:
    """Extract F0 contour from audio file using available backend.

    Tries torchcrepe first, then librosa pyin as fallback.
    Returns 1-D float32 array of F0 values (0.0 = unvoiced).
    """
    data, file_sr = sf.read(audio_path, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    if file_sr != sr:
        import librosa
        data = librosa.resample(data, orig_sr=file_sr, target_sr=sr)

    # Strategy 1: torchcrepe
    try:
        import torch
        import torchcrepe

        audio_tensor = torch.from_numpy(data).float().unsqueeze(0)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        audio_tensor = audio_tensor.to(device)

        pitch = torchcrepe.predict(
            audio_tensor, sr,
            hop_length=int(sr / 100),
            fmin=50, fmax=550,
            model="full",
            batch_size=512,
            device=device,
        )
        return pitch.squeeze().cpu().numpy().astype(np.float32)
    except ImportError:
        pass

    # Strategy 2: librosa pyin
    try:
        import librosa
        f0, voiced, _ = librosa.pyin(
            data, fmin=50, fmax=550, sr=sr,
            frame_length=2048, hop_length=int(sr / 100),
        )
        f0 = np.nan_to_num(f0, nan=0.0)
        return f0.astype(np.float32)
    except ImportError:
        pass

    return np.zeros(len(data) // (sr // 100), dtype=np.float32)


def _align_f0(f0_ref: np.ndarray, f0_hyp: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Trim or pad to equal length."""
    min_len = min(len(f0_ref), len(f0_hyp))
    return f0_ref[:min_len], f0_hyp[:min_len]


def _voiced_mask(f0: np.ndarray, threshold: float = 1.0) -> np.ndarray:
    """Boolean mask where f0 > threshold (voiced frames)."""
    return f0 > threshold


def f0_correlation(f0_ref: np.ndarray, f0_hyp: np.ndarray) -> float:
    """Pearson correlation between reference and hypothesis F0 on jointly voiced frames.

    Returns -1.0 to 1.0 (higher is better). Returns 0.0 if insufficient voiced frames.
    """
    ref, hyp = _align_f0(f0_ref, f0_hyp)
    mask = _voiced_mask(ref) & _voiced_mask(hyp)
    if mask.sum() < 10:
        return 0.0
    r = np.corrcoef(ref[mask], hyp[mask])
    return float(r[0, 1]) if not np.isnan(r[0, 1]) else 0.0


def f0_rmse_cents(f0_ref: np.ndarray, f0_hyp: np.ndarray) -> float:
    """Root mean square error in cents on jointly voiced frames.

    Returns >= 0 (lower is better). 100 cents = 1 semitone.
    """
    ref, hyp = _align_f0(f0_ref, f0_hyp)
    mask = _voiced_mask(ref) & _voiced_mask(hyp)
    if mask.sum() < 2:
        return 0.0
    cents_diff = 1200.0 * np.log2(hyp[mask] / np.maximum(ref[mask], 1e-6))
    return float(np.sqrt(np.mean(cents_diff ** 2)))


def semitone_accuracy(
    f0_ref: np.ndarray,
    f0_hyp: np.ndarray,
    tolerance_cents: float = 50.0,
) -> float:
    """Fraction of jointly voiced frames within tolerance_cents of reference.

    Returns 0.0-1.0 (higher is better).
    """
    ref, hyp = _align_f0(f0_ref, f0_hyp)
    mask = _voiced_mask(ref) & _voiced_mask(hyp)
    if mask.sum() < 2:
        return 0.0
    cents_diff = np.abs(1200.0 * np.log2(hyp[mask] / np.maximum(ref[mask], 1e-6)))
    return float(np.mean(cents_diff <= tolerance_cents))


def vuv_error_rate(f0_ref: np.ndarray, f0_hyp: np.ndarray) -> float:
    """Voiced/Unvoiced classification error rate.

    Returns 0.0-1.0 (lower is better).
    """
    ref, hyp = _align_f0(f0_ref, f0_hyp)
    if len(ref) == 0:
        return 0.0
    ref_voiced = _voiced_mask(ref)
    hyp_voiced = _voiced_mask(hyp)
    errors = ref_voiced != hyp_voiced
    return float(np.mean(errors))
