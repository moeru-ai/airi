"""Axis 2 — Content Preservation: CER/WER via ASR.

Uses faster-whisper (CTranslate2-based Whisper) for transcription.
Falls back to a no-op scorer if faster-whisper is unavailable.
"""

from __future__ import annotations

import logging

_whisper_model = None
logger = logging.getLogger(__name__)


def _resolve_whisper_runtime() -> tuple[str, str]:
    """Pick the fastest stable runtime that is available on this host.

    The faster-whisper maintainers document a large speedup on GPU FP16 / INT8
    compared with CPU inference and also recommend batched or VAD-filtered
    transcription for throughput-sensitive workloads. We keep the model size
    modest (`base`) but move to GPU when present so post-training QA does not
    spend most of its time inside ASR.
    """
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda", "float16"
    except Exception:
        pass

    return "cpu", "int8"


def _get_whisper():
    """Lazy-load the faster-whisper model."""
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    try:
        from faster_whisper import WhisperModel
        device, compute_type = _resolve_whisper_runtime()
        try:
            _whisper_model = WhisperModel("base", device=device, compute_type=compute_type)
        except ValueError:
            # NOTICE: Some Windows CUDA environments only support int8_float16
            # with the locally installed CTranslate2/CUDA combination.
            fallback_type = "int8_float16" if device == "cuda" else "int8"
            _whisper_model = WhisperModel("base", device=device, compute_type=fallback_type)
        return _whisper_model
    except ImportError:
        return None
    except Exception as exc:
        logger.warning("Failed to initialize faster-whisper: %s", exc)
        return None


def transcribe_audio(audio_path: str, language: str | None = None) -> str:
    """Transcribe an audio file to text.

    Returns the full transcription string or empty string if ASR is unavailable.
    """
    model = _get_whisper()
    if model is None:
        return ""

    kwargs: dict = {}
    if language:
        kwargs["language"] = language

    # NOTICE: For report-card QA we favor stable throughput over exhaustive
    # decoding. The official faster-whisper guidance shows beam size heavily
    # influences runtime, and VAD-filtered transcription helps skip silence.
    segments, _info = model.transcribe(
        audio_path,
        beam_size=1,
        condition_on_previous_text=False,
        vad_filter=True,
        **kwargs,
    )
    return " ".join(seg.text.strip() for seg in segments)


def compute_cer(reference: str, hypothesis: str) -> float:
    """Character Error Rate between reference and hypothesis text.

    Returns 0.0 (perfect) to 1.0+ (very bad). Returns 0.0 if jiwer unavailable.
    """
    if not reference or not hypothesis:
        return 0.0
    try:
        import jiwer
        return float(jiwer.cer(reference, hypothesis))
    except ImportError:
        return _fallback_cer(reference, hypothesis)


def compute_wer(reference: str, hypothesis: str) -> float:
    """Word Error Rate between reference and hypothesis text.

    Returns 0.0 (perfect) to 1.0+ (very bad). Returns 0.0 if jiwer unavailable.
    """
    if not reference or not hypothesis:
        return 0.0
    try:
        import jiwer
        return float(jiwer.wer(reference, hypothesis))
    except ImportError:
        return _fallback_wer(reference, hypothesis)


def _fallback_cer(ref: str, hyp: str) -> float:
    """Simple Levenshtein-based CER when jiwer is not installed."""
    if not ref:
        return 0.0
    d = _levenshtein(list(ref), list(hyp))
    return d / max(len(ref), 1)


def _fallback_wer(ref: str, hyp: str) -> float:
    """Simple Levenshtein-based WER when jiwer is not installed."""
    ref_words = ref.split()
    hyp_words = hyp.split()
    if not ref_words:
        return 0.0
    d = _levenshtein(ref_words, hyp_words)
    return d / max(len(ref_words), 1)


def _levenshtein(a: list, b: list) -> int:
    """Minimum edit distance between two sequences."""
    n, m = len(a), len(b)
    dp = list(range(m + 1))
    for i in range(1, n + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, m + 1):
            temp = dp[j]
            if a[i - 1] == b[j - 1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j - 1])
            prev = temp
    return dp[m]
