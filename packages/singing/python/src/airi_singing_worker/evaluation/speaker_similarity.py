"""Axis 1 — Singer Identity: speaker embedding cosine similarity.

Primary: resemblyzer d-vector (256-dim, L2-normalized).
Fallback: MFCC centroid (13-dim) when resemblyzer is unavailable.
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
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "cpu"  # resemblyzer uses numpy internally; MPS offers no speedup here
    except Exception:
        pass
    return "cpu"


def _get_encoder():
    """Lazy-load the resemblyzer VoiceEncoder (d-vector, 256-dim)."""
    global _encoder
    if _encoder is not None:
        return _encoder
    try:
        from resemblyzer import VoiceEncoder
        device = _get_device()
        _encoder = VoiceEncoder(device=device)
        logger.info("resemblyzer VoiceEncoder loaded on %s", device)
        return _encoder
    except Exception as exc:
        logger.warning("resemblyzer unavailable: %s", exc)
        return None


def _load_audio_16k(audio_path: str) -> np.ndarray:
    """Load and resample audio to 16 kHz mono float32."""
    data, sr = sf.read(audio_path, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != _SAMPLE_RATE:
        try:
            import librosa
            data = librosa.resample(data, orig_sr=sr, target_sr=_SAMPLE_RATE)
        except ImportError:
            ratio = _SAMPLE_RATE / sr
            new_len = int(len(data) * ratio)
            indices = np.linspace(0, len(data) - 1, new_len)
            data = np.interp(indices, np.arange(len(data)), data).astype(np.float32)
    return data


def extract_embedding(audio_path: str) -> np.ndarray:
    """Extract a fixed-length speaker embedding vector.

    Returns a 1-D numpy array (256-dim for resemblyzer, 13-dim MFCC fallback).
    Guarantees a non-zero, finite vector so downstream cosine similarity
    never collapses to 0 due to a degenerate embedding.
    """
    encoder = _get_encoder()
    if encoder is not None:
        try:
            wav = _load_audio_16k(audio_path)
            emb = encoder.embed_utterance(wav)
            if _is_valid_embedding(emb):
                return emb
            logger.warning("resemblyzer returned degenerate embedding for %s", audio_path)
        except Exception as exc:
            logger.warning("resemblyzer inference failed for %s: %s", audio_path, exc)

    try:
        import librosa
        data = _load_audio_16k(audio_path)
        mfcc = librosa.feature.mfcc(y=data, sr=_SAMPLE_RATE, n_mfcc=13)
        emb = mfcc.mean(axis=1).astype(np.float32)
        if _is_valid_embedding(emb):
            return emb
        logger.warning("MFCC embedding degenerate for %s", audio_path)
    except Exception as exc:
        logger.warning("MFCC extraction failed for %s: %s", audio_path, exc)

    data = _load_audio_16k(audio_path)
    n_fft = 2048
    hop = 512
    n_frames = max(1, (len(data) - n_fft) // hop + 1)
    features = np.zeros(13, dtype=np.float32)
    for i in range(n_frames):
        frame = data[i * hop: i * hop + n_fft]
        spectrum = np.abs(np.fft.rfft(frame))
        for j in range(min(13, len(spectrum))):
            features[j] += spectrum[j]
    features /= max(n_frames, 1)
    return features


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
            "Embedding dimension mismatch (%d vs %d) — cannot compute similarity",
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
