"""Axis 2 -- Content Preservation: CER/WER via ASR.

Uses faster-whisper (CTranslate2-based Whisper) for transcription and
jiwer for error rate computation.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_whisper_model = None


def _resolve_whisper_runtime() -> tuple[str, str]:
    """Pick the fastest stable runtime available on this host.

    Detects CUDA availability to select GPU vs CPU inference.
    """
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda", "float16"
    except Exception:
        pass

    return "cpu", "int8"


def _get_whisper():
    """Load the faster-whisper model."""
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model

    from faster_whisper import WhisperModel

    device, compute_type = _resolve_whisper_runtime()

    # NOTICE: Some Windows CUDA environments only support int8_float16
    # with the locally installed CTranslate2/CUDA combination. We detect
    # this via CTranslate2's supported types when possible.
    if device == "cuda":
        try:
            import ctranslate2
            supported = ctranslate2.get_supported_compute_types("cuda")
            if compute_type not in supported and "int8_float16" in supported:
                compute_type = "int8_float16"
        except Exception:
            pass

    _whisper_model = WhisperModel("base", device=device, compute_type=compute_type)
    return _whisper_model


def transcribe_audio(audio_path: str, language: str | None = None) -> str:
    """Transcribe an audio file to text.

    Returns the full transcription string.
    """
    model = _get_whisper()

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

    Returns 0.0 (perfect) to 1.0+ (very bad).
    """
    if not reference or not hypothesis:
        return 0.0

    import jiwer
    return float(jiwer.cer(reference, hypothesis))


def compute_wer(reference: str, hypothesis: str) -> float:
    """Word Error Rate between reference and hypothesis text.

    Returns 0.0 (perfect) to 1.0+ (very bad).
    """
    if not reference or not hypothesis:
        return 0.0

    import jiwer
    return float(jiwer.wer(reference, hypothesis))
