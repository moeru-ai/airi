"""Source Audio Analyzer: extract features from input vocal for auto-calibration.

These features drive the parameter prediction formulas.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, asdict

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)


@dataclass
class SourceFeatures:
    f0_median: float = 0.0
    f0_p10: float = 0.0
    f0_p90: float = 0.0
    speaker_embedding: list[float] | None = None
    dynamic_range: float = 0.0
    unvoiced_ratio: float = 0.0
    sibilance_score: float = 0.0
    spectral_flatness: float = 0.0
    source_quality: float = 3.0

    def to_dict(self) -> dict:
        return asdict(self)


def analyze_source(vocal_path: str) -> SourceFeatures:
    """Analyze separated vocal track and return features for param prediction.

    Args:
        vocal_path: Path to the separated vocal audio file.

    Returns:
        SourceFeatures populated with all available metrics.
    """
    feats = SourceFeatures()

    try:
        data, sr = sf.read(vocal_path, dtype="float32")
    except Exception as e:
        logger.error("Failed to read source audio %s: %s", vocal_path, e)
        return feats

    if data.ndim > 1:
        data = data.mean(axis=1)

    # F0 distribution
    try:
        from ..evaluation.melody_accuracy import extract_f0_from_audio
        f0 = extract_f0_from_audio(vocal_path)
        voiced = f0[f0 > 1.0]
        if len(voiced) > 10:
            feats.f0_median = float(np.median(voiced))
            feats.f0_p10 = float(np.percentile(voiced, 10))
            feats.f0_p90 = float(np.percentile(voiced, 90))
            feats.unvoiced_ratio = float(np.mean(f0 <= 1.0))
    except Exception as e:
        logger.warning("F0 extraction failed: %s", e)

    # Speaker embedding
    try:
        from ..evaluation.speaker_similarity import extract_embedding
        emb = extract_embedding(vocal_path)
        feats.speaker_embedding = emb.tolist()
    except Exception as e:
        logger.warning("Speaker embedding extraction failed: %s", e)

    # Dynamic range (RMS in dB)
    try:
        win = int(0.05 * sr)  # 50ms windows
        hop = int(0.025 * sr)
        n_frames = max(1, (len(data) - win) // hop + 1)
        rms = np.zeros(n_frames)
        for i in range(n_frames):
            start = i * hop
            frame = data[start:start + win]
            rms[i] = np.sqrt(np.mean(frame ** 2))
        rms_db = 20.0 * np.log10(np.maximum(rms, 1e-8))
        p95 = np.percentile(rms_db, 95)
        p5 = np.percentile(rms_db, 5)
        # Normalize to 0-1 range (40dB range = 1.0)
        feats.dynamic_range = float(np.clip((p95 - p5) / 40.0, 0.0, 1.0))
    except Exception as e:
        logger.warning("Dynamic range analysis failed: %s", e)

    # Sibilance detection: energy ratio in 4-8 kHz band vs full spectrum
    try:
        feats.sibilance_score = _compute_sibilance(data, sr)
    except Exception as e:
        logger.warning("Sibilance detection failed: %s", e)

    # Spectral flatness
    try:
        import librosa
        sf_vals = librosa.feature.spectral_flatness(y=data, n_fft=2048)
        feats.spectral_flatness = float(np.mean(sf_vals))
    except (ImportError, Exception) as e:
        logger.warning("Spectral flatness failed: %s", e)

    # Source quality estimate via MOS
    try:
        from ..evaluation.naturalness import predict_mos
        feats.source_quality = predict_mos(vocal_path)
    except Exception as e:
        logger.warning("Source quality estimation failed: %s", e)

    return feats


def _compute_sibilance(data: np.ndarray, sr: int) -> float:
    """Spectral energy ratio in 4-8 kHz band vs full spectrum.

    Returns 0.0-1.0 where higher means more sibilant energy.
    """
    n_fft = 2048
    # Use numpy FFT for independence from librosa
    hop = n_fft // 2
    n_frames = max(1, (len(data) - n_fft) // hop + 1)

    sibilance_ratios = []
    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    sibilant_mask = (freq_bins >= 4000) & (freq_bins <= 8000)

    for i in range(n_frames):
        start = i * hop
        frame = data[start:start + n_fft]
        if len(frame) < n_fft:
            break
        spectrum = np.abs(np.fft.rfft(frame * np.hanning(n_fft)))
        total_energy = np.sum(spectrum ** 2)
        if total_energy < 1e-10:
            continue
        sibilant_energy = np.sum(spectrum[sibilant_mask] ** 2)
        sibilance_ratios.append(sibilant_energy / total_energy)

    if not sibilance_ratios:
        return 0.0

    # Normalize: typical speech sibilance ratio is 0.05-0.15
    raw = float(np.mean(sibilance_ratios))
    return float(np.clip(raw / 0.20, 0.0, 1.0))
