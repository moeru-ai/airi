"""Validation Gate: post-inference quality check against voice profile.

Determines whether the converted vocal meets minimum quality thresholds
and identifies specific failure modes for parameter adjustment.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, asdict

import numpy as np
import soundfile as sf

from .voice_profile import VoiceProfile

logger = logging.getLogger(__name__)


@dataclass
class GateResult:
    passed: bool = False
    singer_similarity: float = 0.0
    f0_corr: float = 0.0
    source_leakage: float = 0.0
    tearing_risk: float = 0.0
    failed_metrics: list[str] | None = None

    def to_dict(self) -> dict:
        d = asdict(self)
        if d["failed_metrics"] is None:
            d["failed_metrics"] = []
        return d


# Default thresholds
DEFAULT_THRESHOLDS = {
    "singer_similarity": 0.65,
    "f0_corr": 0.85,
    "source_leakage_max": 0.40,
}


def run_validation_gate(
    output_path: str,
    source_path: str,
    voice_profile: VoiceProfile,
    thresholds: dict[str, float] | None = None,
) -> GateResult:
    """Run post-inference quality gate on converted vocal.

    Args:
        output_path: Path to the converted vocal audio.
        source_path: Path to the original separated vocal (pre-conversion).
        voice_profile: Target voice model's profile.
        thresholds: Optional dict overriding default quality thresholds.

    Returns:
        GateResult indicating pass/fail and per-metric scores.
    """
    t = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    result = GateResult(failed_metrics=[])

    # 1. Singer similarity vs voice profile centroid
    try:
        from ..evaluation.speaker_similarity import extract_embedding, compute_similarity
        output_emb = extract_embedding(output_path)
        if voice_profile.embedding_centroid:
            centroid = np.array(voice_profile.embedding_centroid, dtype=np.float32)
            result.singer_similarity = compute_similarity(centroid, output_emb)
        else:
            result.singer_similarity = 0.5
    except Exception as e:
        logger.warning("Singer similarity check failed: %s", e)
        result.singer_similarity = 0.5

    # 2. F0 correlation with source (melody preservation)
    try:
        from ..evaluation.melody_accuracy import extract_f0_from_audio, f0_correlation
        f0_src = extract_f0_from_audio(source_path)
        f0_out = extract_f0_from_audio(output_path)
        result.f0_corr = f0_correlation(f0_src, f0_out)
    except Exception as e:
        logger.warning("F0 correlation check failed: %s", e)
        result.f0_corr = 0.5

    # 3. Source leakage (output should NOT sound like the source singer)
    try:
        from ..evaluation.speaker_similarity import extract_embedding, compute_similarity
        src_emb = extract_embedding(source_path)
        out_emb = extract_embedding(output_path)
        result.source_leakage = compute_similarity(src_emb, out_emb)
    except Exception as e:
        logger.warning("Source leakage check failed: %s", e)
        result.source_leakage = 0.5

    # 4. Tearing / artifact detection
    try:
        result.tearing_risk = _detect_tearing(output_path, source_path)
    except Exception as e:
        logger.warning("Tearing detection failed: %s", e)
        result.tearing_risk = 0.0

    # Evaluate pass/fail
    failed = []
    if result.singer_similarity < t.get("singer_similarity", 0.65):
        failed.append("singer_similarity")
    if result.f0_corr < t.get("f0_corr", 0.85):
        failed.append("f0_corr")
    if result.source_leakage > t.get("source_leakage_max", 0.40):
        failed.append("source_leakage")
    if result.tearing_risk > 0.5:
        failed.append("tearing")

    result.failed_metrics = failed
    result.passed = len(failed) == 0

    return result


def _detect_tearing(output_path: str, source_path: str) -> float:
    """Detect high-frequency transient anomalies (tearing/electronic artifacts).

    Compares spectral flux in 6-16 kHz band between output and source.
    High divergence suggests tearing artifacts.

    Returns 0.0-1.0 where higher means more tearing detected.
    """
    try:
        out_data, out_sr = sf.read(output_path, dtype="float32")
        src_data, src_sr = sf.read(source_path, dtype="float32")

        if out_data.ndim > 1:
            out_data = out_data.mean(axis=1)
        if src_data.ndim > 1:
            src_data = src_data.mean(axis=1)

        n_fft = 2048
        hop = n_fft // 2

        out_flux = _spectral_flux_hf(out_data, out_sr, n_fft, hop)
        src_flux = _spectral_flux_hf(src_data, src_sr, n_fft, hop)

        min_len = min(len(out_flux), len(src_flux))
        if min_len < 5:
            return 0.0

        out_flux = out_flux[:min_len]
        src_flux = src_flux[:min_len]

        # Ratio of output HF flux to source HF flux
        src_mean = np.mean(src_flux) + 1e-8
        out_mean = np.mean(out_flux)
        ratio = out_mean / src_mean

        # Normalized: ratio > 2.0 is suspicious, > 4.0 is very likely tearing
        tearing = float(np.clip((ratio - 1.0) / 3.0, 0.0, 1.0))
        return tearing

    except Exception:
        return 0.0


def _spectral_flux_hf(
    data: np.ndarray,
    sr: int,
    n_fft: int,
    hop: int,
) -> np.ndarray:
    """Compute spectral flux in the 6-16 kHz band."""
    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    hf_mask = (freq_bins >= 6000) & (freq_bins <= min(16000, sr // 2))

    n_frames = max(1, (len(data) - n_fft) // hop + 1)
    prev_spectrum = None
    flux = np.zeros(n_frames)

    for i in range(n_frames):
        start = i * hop
        frame = data[start:start + n_fft]
        if len(frame) < n_fft:
            break
        spectrum = np.abs(np.fft.rfft(frame * np.hanning(n_fft)))
        hf_spectrum = spectrum[hf_mask]

        if prev_spectrum is not None:
            diff = hf_spectrum - prev_spectrum
            flux[i] = float(np.sum(np.maximum(diff, 0) ** 2))
        prev_spectrum = hf_spectrum

    return flux
