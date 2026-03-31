"""Axis 1 -- Singer Identity: speaker embedding cosine similarity.

Uses resemblyzer d-vector (256-dim, L2-normalized) exclusively.
"""

from __future__ import annotations

import logging

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

_encoder = None
_SAMPLE_RATE = 16000


def _get_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def _get_encoder():
    """Load the resemblyzer VoiceEncoder (d-vector, 256-dim)."""
    global _encoder
    if _encoder is not None:
        return _encoder

    from resemblyzer import VoiceEncoder
    device = _get_device()
    _encoder = VoiceEncoder(device=device)
    logger.info("resemblyzer VoiceEncoder loaded on %s", device)
    return _encoder


def _load_audio_16k(audio_path: str) -> np.ndarray:
    """Load and resample audio to 16 kHz mono float32."""
    import librosa

    data, sr = sf.read(audio_path, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != _SAMPLE_RATE:
        data = librosa.resample(data, orig_sr=sr, target_sr=_SAMPLE_RATE)
    return data


def extract_embedding(audio_path: str) -> np.ndarray:
    """Extract a 256-dim resemblyzer d-vector speaker embedding.

    Guarantees a non-zero, finite vector so downstream cosine similarity
    never collapses to 0 due to a degenerate embedding.
    """
    encoder = _get_encoder()
    wav = _load_audio_16k(audio_path)
    emb = encoder.embed_utterance(wav)

    if not _is_valid_embedding(emb):
        raise ValueError(
            f"resemblyzer returned degenerate embedding for {audio_path}"
        )
    return emb


def _is_valid_embedding(emb: np.ndarray) -> bool:
    """Return True when the embedding is non-empty, non-zero, and finite."""
    if emb.size == 0:
        return False
    if not np.all(np.isfinite(emb)):
        return False
    if np.linalg.norm(emb) < 1e-9:
        return False
    return True


def compute_similarity(emb_a: np.ndarray, emb_b: np.ndarray) -> float:
    """Cosine similarity between two embedding vectors. Returns 0.0-1.0."""
    a = emb_a.flatten().astype(np.float64)
    b = emb_b.flatten().astype(np.float64)
    if a.shape != b.shape:
        logger.warning(
            "Embedding dimension mismatch (%d vs %d) -- cannot compute similarity",
            a.shape[0], b.shape[0],
        )
        return 0.0
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a < 1e-9 or norm_b < 1e-9:
        return 0.0
    sim = float(np.dot(a, b) / (norm_a * norm_b))
    return max(0.0, min(1.0, (sim + 1.0) / 2.0))


def compute_embedding_centroid(audio_paths: list[str]) -> np.ndarray:
    """Compute the mean embedding across multiple audio files."""
    embeddings = [extract_embedding(p) for p in audio_paths]
    return np.mean(embeddings, axis=0).astype(np.float32)
