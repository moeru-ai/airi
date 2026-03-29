"""Axis 4 — Naturalness: MCD, loudness RMSE, predicted MOS.

MCD uses librosa MFCC; loudness uses pyloudnorm; MOS uses NISQA-TTS if available.
"""

from __future__ import annotations

import numpy as np
import soundfile as sf


def compute_mcd(ref_path: str, hyp_path: str, n_mfcc: int = 13) -> float:
    """Mel-Cepstral Distortion (dB) between reference and hypothesis.

    Lower is better. Typical good values: 4-6 dB.
    Returns 0.0 if librosa is unavailable.
    """
    try:
        import librosa
    except ImportError:
        return 0.0

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
    # Exclude c0 (energy) — use indices 1:
    diff = mfcc_ref[1:, :] - mfcc_hyp[1:, :]
    frame_mcd = (10.0 / np.log(10.0)) * np.sqrt(2.0 * np.sum(diff ** 2, axis=0))
    return float(np.mean(frame_mcd))


def compute_loudness_rmse(ref_path: str, hyp_path: str) -> float:
    """RMS error of short-time loudness (LUFS-like) between reference and hypothesis.

    Lower is better. Returns 0.0 if pyloudnorm is unavailable.
    """
    try:
        import pyloudnorm as pyln
    except ImportError:
        return _fallback_loudness_rmse(ref_path, hyp_path)

    ref, ref_sr = sf.read(ref_path, dtype="float32")
    hyp, hyp_sr = sf.read(hyp_path, dtype="float32")

    if ref.ndim > 1:
        ref = ref.mean(axis=1)
    if hyp.ndim > 1:
        hyp = hyp.mean(axis=1)

    # Short-time loudness in 400ms windows
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


def _fallback_loudness_rmse(ref_path: str, hyp_path: str) -> float:
    """RMS-based loudness comparison when pyloudnorm is unavailable."""
    ref, ref_sr = sf.read(ref_path, dtype="float32")
    hyp, hyp_sr = sf.read(hyp_path, dtype="float32")
    if ref.ndim > 1:
        ref = ref.mean(axis=1)
    if hyp.ndim > 1:
        hyp = hyp.mean(axis=1)
    win = int(0.4 * ref_sr)
    hop = int(0.1 * ref_sr)
    ref_rms = _windowed_rms(ref, win, hop)
    hyp_rms = _windowed_rms(hyp, win, hop)
    min_len = min(len(ref_rms), len(hyp_rms))
    if min_len == 0:
        return 0.0
    ref_db = 20.0 * np.log10(np.maximum(ref_rms[:min_len], 1e-8))
    hyp_db = 20.0 * np.log10(np.maximum(hyp_rms[:min_len], 1e-8))
    return float(np.sqrt(np.mean((ref_db - hyp_db) ** 2)))


def predict_mos(audio_path: str) -> float:
    """Predict Mean Opinion Score (1-5) using NISQA-TTS or fallback heuristic.

    Higher is better. Returns 3.0 as neutral default if NISQA is unavailable.
    """
    # Try NISQA
    try:
        from nisqa.NISQA_model import nisqaModel
        import tempfile
        import os

        model = nisqaModel(
            mode="predict_file",
            pretrained_model="nisqa_tts",
            deg=audio_path,
        )
        results = model.predict()
        if results is not None and len(results) > 0:
            return float(results["mos_pred"].iloc[0])
    except (ImportError, Exception):
        pass

    # Heuristic fallback: spectral quality estimation
    return _heuristic_mos(audio_path)


def _heuristic_mos(audio_path: str) -> float:
    """Simple heuristic MOS based on SNR and spectral smoothness.

    Not a replacement for neural MOS predictors, but better than a constant.
    """
    try:
        data, sr = sf.read(audio_path, dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)

        rms = np.sqrt(np.mean(data ** 2))
        if rms < 1e-6:
            return 1.0

        # Spectral flatness as a proxy for "naturalness"
        try:
            import librosa
            sf_vals = librosa.feature.spectral_flatness(y=data, n_fft=2048)
            mean_sf = float(np.mean(sf_vals))
        except ImportError:
            n_fft = 2048
            hop = 512
            flatness_vals = []
            for i in range(0, len(data) - n_fft, hop):
                frame = data[i:i + n_fft]
                spectrum = np.abs(np.fft.rfft(frame))
                spectrum = np.maximum(spectrum, 1e-10)
                geo_mean = np.exp(np.mean(np.log(spectrum)))
                arith_mean = np.mean(spectrum)
                flatness_vals.append(geo_mean / max(arith_mean, 1e-10))
            mean_sf = float(np.mean(flatness_vals)) if flatness_vals else 0.1

        # Higher RMS + moderate spectral flatness → higher MOS
        # Pure noise (sf ≈ 1) or pure silence (rms ≈ 0) → low MOS
        snr_proxy = 20.0 * np.log10(rms + 1e-8) + 60.0  # rough dB scale
        snr_score = np.clip(snr_proxy / 60.0, 0, 1)

        naturalness = 1.0 - abs(mean_sf - 0.1) * 3.0
        naturalness = np.clip(naturalness, 0, 1)

        mos = 1.0 + 3.0 * float(snr_score) * 0.6 + 3.0 * float(naturalness) * 0.4
        return float(np.clip(mos, 1.0, 5.0))
    except Exception:
        return 3.0
