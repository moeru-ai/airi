"""Retry Strategy: adjust inference parameters based on validation gate failures.

When the validation gate fails, this module suggests parameter adjustments
targeting the specific metrics that failed. Maximum 3 retries.
"""

from __future__ import annotations

import logging
from copy import deepcopy

from .param_predictor import PredictedParams, _clamp
from .validation_gate import GateResult

logger = logging.getLogger(__name__)

MAX_RETRIES = 3

# Per-metric adjustment deltas
ADJUSTMENTS = {
    "singer_similarity": {"index_rate": +0.15},
    "source_leakage": {"index_rate": +0.10},
    "tearing": {"protect": -0.08},
    "f0_corr": {"pitch_shift_delta": 1},
    "content_score": {"index_rate": -0.12},
}


def adjust_params(
    current_params: PredictedParams,
    gate_result: GateResult,
    attempt: int,
) -> PredictedParams:
    """Adjust parameters based on which metrics failed in the validation gate.

    Args:
        current_params: Parameters used in the most recent inference.
        gate_result: Result from the validation gate.
        attempt: Current retry attempt number (1-based).

    Returns:
        Adjusted PredictedParams for the next inference attempt.
    """
    if attempt > MAX_RETRIES:
        logger.warning("Max retries (%d) reached, returning current params", MAX_RETRIES)
        return current_params

    adjusted = PredictedParams(
        pitch_shift=current_params.pitch_shift,
        index_rate=current_params.index_rate,
        filter_radius=current_params.filter_radius,
        protect=current_params.protect,
        rms_mix_rate=current_params.rms_mix_rate,
    )

    failed = gate_result.failed_metrics or []

    for metric in failed:
        if metric == "singer_similarity":
            delta = ADJUSTMENTS["singer_similarity"]["index_rate"]
            adjusted.index_rate = _clamp(adjusted.index_rate + delta, 0.10, 0.90)
            logger.info(
                "Attempt %d: singer_similarity low -> index_rate %.2f -> %.2f",
                attempt, current_params.index_rate, adjusted.index_rate,
            )

        elif metric == "source_leakage":
            delta = ADJUSTMENTS["source_leakage"]["index_rate"]
            adjusted.index_rate = _clamp(adjusted.index_rate + delta, 0.10, 0.90)
            logger.info(
                "Attempt %d: source_leakage high -> index_rate %.2f -> %.2f",
                attempt, current_params.index_rate, adjusted.index_rate,
            )

        elif metric == "tearing":
            delta = ADJUSTMENTS["tearing"]["protect"]
            adjusted.protect = _clamp(adjusted.protect + delta, 0.10, 0.50)
            logger.info(
                "Attempt %d: tearing detected -> protect %.2f -> %.2f",
                attempt, current_params.protect, adjusted.protect,
            )

        elif metric == "content_score":
            delta = ADJUSTMENTS["content_score"]["index_rate"]
            adjusted.index_rate = _clamp(adjusted.index_rate + delta, 0.10, 0.90)
            logger.info(
                "Attempt %d: content_score low -> index_rate %.2f -> %.2f",
                attempt, current_params.index_rate, adjusted.index_rate,
            )

        elif metric == "f0_corr":
            direction = 1 if attempt % 2 == 1 else -1
            adjusted.pitch_shift = current_params.pitch_shift + direction
            adjusted.pitch_shift = max(-12, min(12, adjusted.pitch_shift))
            logger.info(
                "Attempt %d: f0_corr low -> pitch_shift %d -> %d",
                attempt, current_params.pitch_shift, adjusted.pitch_shift,
            )

    # If dynamic range caused flat output (implicit from listening feedback),
    # scale down rms_mix_rate progressively
    if attempt >= 2 and "singer_similarity" not in failed:
        adjusted.rms_mix_rate = _clamp(
            adjusted.rms_mix_rate - 0.10 * attempt,
            0.05, 0.80,
        )

    adjusted.index_rate = round(adjusted.index_rate, 2)
    adjusted.protect = round(adjusted.protect, 2)
    adjusted.rms_mix_rate = round(adjusted.rms_mix_rate, 2)

    return adjusted


def select_best_result(
    results: list[tuple[PredictedParams, GateResult]],
) -> tuple[PredictedParams, GateResult, int]:
    """Select the best inference result across all retry attempts.

    Uses a composite score: singer_similarity * 0.4 + f0_corr * 0.3 + (1 - source_leakage) * 0.3

    Returns:
        (best_params, best_gate_result, attempt_index)
    """
    if not results:
        raise ValueError("No results to select from")

    best_idx = 0
    best_score = -1.0

    for i, (params, gate) in enumerate(results):
        score = (
            0.4 * gate.singer_similarity
            + 0.3 * gate.f0_corr
            + 0.3 * (1.0 - gate.source_leakage)
        )
        if score > best_score:
            best_score = score
            best_idx = i

    params, gate = results[best_idx]
    return params, gate, best_idx
