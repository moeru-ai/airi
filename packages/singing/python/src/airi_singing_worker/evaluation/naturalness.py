"""Axis 4 -- Naturalness: MCD, loudness RMSE, predicted MOS.

Requires: librosa, pyloudnorm, nisqa.
"""

from __future__ import annotations

import numpy as np
import soundfile as sf


def compute_mcd(ref_path: str, hyp_path: str, n_mfcc: int = 13) -> float:
    """Mel-Cepstral Distortion (dB) between reference and hypothesis.

    Lower is better. Typical good values: 4-6 dB.
    """
    import librosa

    ref, ref_sr = sf.read(ref_path, dtype="float32")
    hyp, hyp_sr = sf.read(hyp_path, dtype="float32")

    if ref.ndim > 1:
        ref = ref.mean(axis=1)
    if hyp.ndim > 1:
        hyp = hyp.mean(axis=1)

    target_sr = 22050
    if ref_sr != target_sr:
        ref = librosa.resample(ref, orig_sr=ref_sr, target_sr=target_sr)
    if hyp_sr != target_sr:
        hyp = librosa.resample(hyp, orig_sr=hyp_sr, target_sr=target_sr)

    mfcc_ref = librosa.feature.mfcc(y=ref, sr=target_sr, n_mfcc=n_mfcc)
    mfcc_hyp = librosa.feature.mfcc(y=hyp, sr=target_sr, n_mfcc=n_mfcc)

    min_len = min(mfcc_ref.shape[1], mfcc_hyp.shape[1])
    mfcc_ref = mfcc_ref[:, :min_len]
    mfcc_hyp = mfcc_hyp[:, :min_len]

    # MCD formula: (10/ln10) * sqrt(2 * sum((c_ref - c_hyp)^2))
    # Exclude c0 (energy)
    diff = mfcc_ref[1:, :] - mfcc_hyp[1:, :]
    frame_mcd = (10.0 / np.log(10.0)) * np.sqrt(2.0 * np.sum(diff ** 2, axis=0))
    return float(np.mean(frame_mcd))


def compute_loudness_rmse(ref_path: str, hyp_path: str) -> float:
    """RMS error of short-time loudness (LUFS-like) between reference and hypothesis.

    Lower is better.
    """
    import pyloudnorm as pyln  # noqa: F401

    ref, ref_sr = sf.read(ref_path, dtype="float32")
    hyp, hyp_sr = sf.read(hyp_path, dtype="float32")

    if ref.ndim > 1:
        ref = ref.mean(axis=1)
    if hyp.ndim > 1:
        hyp = hyp.mean(axis=1)

    win = int(0.4 * ref_sr)
    hop = int(0.1 * ref_sr)

    ref_loud = _windowed_rms(ref, win, hop)
    hyp_loud = _windowed_rms(hyp, win, hop)

    min_len = min(len(ref_loud), len(hyp_loud))
    if min_len == 0:
        return 0.0

    ref_db = 20.0 * np.log10(np.maximum(ref_loud[:min_len], 1e-8))
    hyp_db = 20.0 * np.log10(np.maximum(hyp_loud[:min_len], 1e-8))

    return float(np.sqrt(np.mean((ref_db - hyp_db) ** 2)))


def _windowed_rms(signal: np.ndarray, win: int, hop: int) -> np.ndarray:
    """Compute windowed RMS energy."""
    n_frames = max(1, (len(signal) - win) // hop + 1)
    rms = np.zeros(n_frames)
    for i in range(n_frames):
        start = i * hop
        frame = signal[start:start + win]
        rms[i] = np.sqrt(np.mean(frame ** 2))
    return rms


def predict_mos(audio_path: str) -> float:
    """Predict Mean Opinion Score (1-5) using NISQA-TTS.

    Higher is better.
    """
    from nisqa.NISQA_model import nisqaModel

    model = nisqaModel(
        mode="predict_file",
        pretrained_model="nisqa_tts",
        deg=audio_path,
    )
    results = model.predict()
    if results is not None and len(results) > 0:
        return float(results["mos_pred"].iloc[0])

    raise RuntimeError(f"NISQA returned no results for {audio_path}")
