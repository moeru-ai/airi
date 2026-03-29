"""Evaluation metrics for singing voice conversion quality assessment.

Four-axis scoring:
  1. Singer Identity — speaker embedding cosine similarity
  2. Content Preservation — CER/WER via ASR
  3. Melody Accuracy — F0 correlation, RMSE, semitone accuracy, VUV error
  4. Naturalness — MCD, loudness RMSE, predicted MOS
"""

from .speaker_similarity import extract_embedding, compute_similarity
from .content_preservation import transcribe_audio, compute_cer, compute_wer
from .melody_accuracy import (
    f0_correlation,
    f0_rmse_cents,
    semitone_accuracy,
    vuv_error_rate,
)
from .naturalness import compute_mcd, compute_loudness_rmse, predict_mos
from .composite import ReportCard, run_evaluation, check_thresholds

__all__ = [
    "extract_embedding",
    "compute_similarity",
    "transcribe_audio",
    "compute_cer",
    "compute_wer",
    "f0_correlation",
    "f0_rmse_cents",
    "semitone_accuracy",
    "vuv_error_rate",
    "compute_mcd",
    "compute_loudness_rmse",
    "predict_mos",
    "ReportCard",
    "run_evaluation",
    "check_thresholds",
]
