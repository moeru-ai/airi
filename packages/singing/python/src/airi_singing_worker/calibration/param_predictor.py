"""Parameter Predictor: auto-tune RVC inference parameters per song.

Implements the formulas from the AI Cover upgrade specification:
  - Pitch Shift: F0 median matching with overflow penalty
  - Index Rate: based on embedding mismatch and quality gap
  - Protect: based on unvoiced ratio and sibilance
  - RMS Mix Rate: based on source dynamic range
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, asdict
from math import log2

import numpy as np

from .voice_profile import VoiceProfile
from .source_analyzer import SourceFeatures

logger = logging.getLogger(__name__)


@dataclass
class PredictedParams:
    pitch_shift: int = 0
    pitch_confidence: float = 0.0
    index_rate: float = 0.75
    filter_radius: int = 3
    protect: float = 0.33
    rms_mix_rate: float = 0.25

    def to_dict(self) -> dict:
        return asdict(self)


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _overflow_penalty(
    source_f0_p10: float,
    source_f0_p90: float,
    target_f0_p10: float,
    target_f0_p90: float,
    k: int,
) -> float:
    """Penalize pitch shifts that push source F0 range outside target comfort zone.

    Computes the fraction of the shifted source range that exceeds the target
    model's p10-p90 range, weighted by the overshoot magnitude.
    """
    ratio = 2.0 ** (k / 12.0)
    shifted_p10 = source_f0_p10 * ratio
    shifted_p90 = source_f0_p90 * ratio

    penalty = 0.0
    # Low overshoot: shifted range extends below target p10
    if shifted_p10 < target_f0_p10 and target_f0_p10 > 0:
        low_over = 12.0 * abs(log2(max(shifted_p10, 1e-3) / target_f0_p10))
        penalty += low_over

    # High overshoot: shifted range extends above target p90
    if shifted_p90 > target_f0_p90 and target_f0_p90 > 0:
        high_over = 12.0 * abs(log2(shifted_p90 / max(target_f0_p90, 1e-3)))
        penalty += high_over

    return penalty


@dataclass
class PitchShiftResult:
    shift: int = 0
    confidence: float = 0.0


def predict_pitch_shift(
    source: SourceFeatures,
    profile: VoiceProfile,
    lambda1: float = 1.0,
    lambda2: float = 0.5,
    max_shift: int = 4,
) -> PitchShiftResult:
    """Find optimal semitone shift to match source F0 median to target.

    Searches k in [-max_shift, max_shift] minimizing:
      lambda1 * |12*log2((S50 * 2^(k/12)) / T50)| + lambda2 * overflow_penalty

    Returns PitchShiftResult with shift and confidence. When voiced frame
    statistics are insufficient, returns shift=0 with confidence=0.0.
    """
    s50 = source.f0_median
    t50 = profile.f0_p50

    if s50 < 1.0 or t50 < 1.0:
        logger.warning(
            "Insufficient F0 statistics (source_median=%.1f, target_p50=%.1f), "
            "skipping pitch shift",
            s50, t50,
        )
        return PitchShiftResult(shift=0, confidence=0.0)

    best_k = 0
    best_cost = float("inf")

    for k in range(-max_shift, max_shift + 1):
        shifted_s50 = s50 * (2.0 ** (k / 12.0))
        if shifted_s50 <= 0:
            continue
        deviation = abs(12.0 * log2(shifted_s50 / t50))

        overflow = _overflow_penalty(
            source.f0_p10, source.f0_p90,
            profile.f0_p10, profile.f0_p90,
            k,
        )

        cost = lambda1 * deviation + lambda2 * overflow
        if cost < best_cost:
            best_cost = cost
            best_k = k

    # Confidence based on how well the shift aligns medians (0-1 scale)
    if best_cost < 0.01:
        confidence = 1.0
    else:
        confidence = _clamp(1.0 / (1.0 + best_cost), 0.0, 1.0)

    if best_k != 0:
        logger.info(
            "Auto pitch shift: %+d semitones (confidence=%.2f, source_median=%.1fHz, target_p50=%.1fHz)",
            best_k, confidence, s50, t50,
        )

    return PitchShiftResult(shift=best_k, confidence=confidence)


def predict_index_rate(
    source: SourceFeatures,
    profile: VoiceProfile,
    content_risk: float = 0.0,
) -> float:
    """Predict optimal index rate based on embedding mismatch, quality gap, range mismatch, and content risk.

    Higher index_rate strengthens accent/timbre transfer but also increases
    artifact risk. When source and target vocal ranges differ significantly,
    lower index_rate reduces timbre leakage from the retrieval index.
    """
    mismatch = 0.5
    if source.speaker_embedding and profile.embedding_centroid:
        from ..evaluation.speaker_similarity import compute_similarity
        src_emb = np.array(source.speaker_embedding, dtype=np.float32)
        tgt_emb = np.array(profile.embedding_centroid, dtype=np.float32)
        sim = compute_similarity(src_emb, tgt_emb)
        mismatch = 1.0 - sim

    target_quality = 3.5
    quality_gap = max(0.0, source.source_quality - target_quality)

    # Range mismatch: penalize when source and target F0 ranges differ significantly
    range_mismatch = 0.0
    if source.f0_max > 1.0 and profile.f0_p90 > 1.0:
        src_range_st = 12.0 * log2(max(source.f0_max, 1.0) / max(source.f0_min, 1.0))
        tgt_range_st = 12.0 * log2(max(profile.f0_p90, 1.0) / max(profile.f0_p10, 1.0))
        range_mismatch = _clamp(abs(src_range_st - tgt_range_st) / 24.0, 0.0, 1.0)

    rate = (
        0.30
        + 0.24 * mismatch
        - 0.22 * quality_gap
        - 0.12 * range_mismatch
        - 0.20 * content_risk
        - 0.10 * source.sibilance_score
        - 0.08 * source.spectral_flatness
    )
    return _clamp(rate, 0.10, 0.82)


def predict_protect(
    source: SourceFeatures,
    tearing_risk: float = 0.0,
) -> float:
    """Predict optimal protect value based on sibilance, unvoiced ratio, bleed, and tearing risk.

    Lower protect = stronger consonant/breath protection = less electronic tearing.
    Higher bleed_score raises protect to compensate for separation artifacts.
    """
    val = (
        0.42
        - 0.22 * source.unvoiced_ratio
        - 0.18 * source.sibilance_score
        - 0.14 * tearing_risk
        - 0.10 * source.spectral_flatness
        + 0.08 * source.bleed_score
    )
    return _clamp(val, 0.10, 0.50)


def predict_rms_mix_rate(source: SourceFeatures) -> float:
    """Predict optimal RMS mix rate based on source dynamic range.

    rms_mix_rate = clamp(
        0.55 - 0.35 * source_dynamic_range + 0.20 * output_instability,
        0.05, 0.80
    )
    """
    output_instability = 0.0  # updated in retry loop

    val = 0.55 - 0.35 * source.dynamic_range + 0.20 * output_instability
    return _clamp(val, 0.05, 0.80)


def predict_params(
    source: SourceFeatures,
    profile: VoiceProfile,
    tearing_risk: float = 0.0,
    content_risk: float = 0.0,
) -> PredictedParams:
    """Predict all RVC parameters from source features and voice profile.

    Args:
        source: Extracted features from the input vocal.
        profile: Target voice model profile.
        tearing_risk: 0-1 score from previous inference indicating electronic tearing severity.
        content_risk: 0-1 score from previous inference indicating content/lyric degradation.
    """
    pitch_result = predict_pitch_shift(source, profile)
    return PredictedParams(
        pitch_shift=pitch_result.shift,
        pitch_confidence=round(pitch_result.confidence, 3),
        index_rate=round(predict_index_rate(source, profile, content_risk), 2),
        filter_radius=3,
        protect=round(predict_protect(source, tearing_risk), 2),
        rms_mix_rate=round(predict_rms_mix_rate(source), 2),
    )
