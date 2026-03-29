"""Axis 1 — Singer Identity: speaker embedding cosine similarity.

Uses speechbrain ECAPA-TDNN (spkrec-ecapa-voxceleb) for embedding extraction.
Falls back to a simpler MFCC centroid approach if speechbrain is unavailable.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

_classifier = None
_SAMPLE_RATE = 16000


def _get_classifier():
    """Lazy-load the speechbrain ECAPA-TDNN classifier."""
    global _classifier
    if _classifier is not None:
        return _classifier
    try:
        from speechbrain.inference.speaker import EncoderClassifier
        _classifier = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            run_opts={"device": "cpu"},
        )
        return _classifier
    except ImportError:
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

    Returns a 1-D numpy array (192-dim for ECAPA-TDNN, 13-dim MFCC fallback).
    """
    classifier = _get_classifier()
    if classifier is not None:
        import torch
        waveform = _load_audio_16k(audio_path)
        tensor = torch.from_numpy(waveform).unsqueeze(0)
        embedding = classifier.encode_batch(tensor)
        return embedding.squeeze().cpu().numpy()

    # Fallback: MFCC-based embedding when speechbrain is unavailable
    try:
        import librosa
        data = _load_audio_16k(audio_path)
        mfcc = librosa.feature.mfcc(y=data, sr=_SAMPLE_RATE, n_mfcc=13)
        return mfcc.mean(axis=1).astype(np.float32)
    except ImportError:
        pass

    # Last resort: FFT-based spectral centroid when librosa is also unavailable
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


def compute_similarity(emb_a: np.ndarray, emb_b: np.ndarray) -> float:
    """Cosine similarity between two embedding vectors. Returns 0.0-1.0."""
    a = emb_a.flatten().astype(np.float64)
    b = emb_b.flatten().astype(np.float64)
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
