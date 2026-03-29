"""Axis 2 — Content Preservation: CER/WER via ASR.

Uses faster-whisper (CTranslate2-based Whisper) for transcription.
Falls back to a no-op scorer if faster-whisper is unavailable.
"""

from __future__ import annotations

_whisper_model = None


def _get_whisper():
    """Lazy-load the faster-whisper model."""
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    try:
        from faster_whisper import WhisperModel
        _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        return _whisper_model
    except ImportError:
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

    segments, _info = model.transcribe(audio_path, beam_size=5, **kwargs)
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
