"""Voice Profile: per-model audio characteristics extracted from training data.

Used as the reference baseline for auto-calibration and validation gate.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from ..errors.base import SingingWorkerError

logger = logging.getLogger(__name__)


@dataclass
class VoiceProfile:
    voice_id: str = ""
    embedding_centroid: list[float] = field(default_factory=list)
    f0_p10: float = 0.0
    f0_p50: float = 0.0
    f0_p90: float = 0.0
    energy_mean: float = 0.0
    energy_std: float = 0.0
    dynamic_range_db: float = 0.0
    unvoiced_ratio: float = 0.0
    spectral_centroid: float = 0.0
    spectral_flatness: float = 0.0
    sample_count: int = 0

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)


def build_voice_profile(
    audio_paths: list[str],
    voice_id: str = "unknown",
) -> VoiceProfile:
    """Build a VoiceProfile from a set of audio files (training segments).

    Extracts speaker embedding centroid, F0 distribution, energy stats,
    spectral characteristics.
    """
    from ..evaluation.speaker_similarity import extract_embedding

    profile = VoiceProfile(voice_id=voice_id, sample_count=len(audio_paths))

    if not audio_paths:
        raise SingingWorkerError(
            f'No training segments were available to build the voice profile for "{voice_id}"',
            code='VOICE_PROFILE_INVALID',
        )

    # Speaker embedding centroid
    embeddings = []
    for p in audio_paths:
        try:
            emb = extract_embedding(p)
            embeddings.append(emb)
        except Exception as e:
            logger.warning("Failed to extract embedding from %s: %s", p, e)

    profile.embedding_centroid = _compute_profile_centroid(
        embeddings=embeddings,
        voice_id=voice_id,
        sample_count=len(audio_paths),
    )

    # F0 distribution
    all_f0 = []
    for p in audio_paths:
        try:
            from ..evaluation.melody_accuracy import extract_f0_from_audio
            f0 = extract_f0_from_audio(p)
            voiced = f0[f0 > 1.0]
            if len(voiced) > 0:
                all_f0.append(voiced)
        except Exception as e:
            logger.warning("Failed to extract F0 from %s: %s", p, e)

    if all_f0:
        all_voiced = np.concatenate(all_f0)
        profile.f0_p10 = float(np.percentile(all_voiced, 10))
        profile.f0_p50 = float(np.percentile(all_voiced, 50))
        profile.f0_p90 = float(np.percentile(all_voiced, 90))

    # Energy and spectral stats
    all_rms = []
    all_unvoiced_ratios = []
    all_spectral_centroid = []
    all_spectral_flatness = []

    for p in audio_paths:
        try:
            data, sr = sf.read(p, dtype="float32")
            if data.ndim > 1:
                data = data.mean(axis=1)
            rms = np.sqrt(np.mean(data ** 2))
            all_rms.append(rms)

            # Unvoiced ratio from F0
            from ..evaluation.melody_accuracy import extract_f0_from_audio
            f0 = extract_f0_from_audio(p)
            if len(f0) > 0:
                all_unvoiced_ratios.append(float(np.mean(f0 <= 1.0)))

            # Spectral features
            try:
                import librosa
                sc = librosa.feature.spectral_centroid(y=data, sr=sr)
                sf_vals = librosa.feature.spectral_flatness(y=data)
                all_spectral_centroid.append(float(np.mean(sc)))
                all_spectral_flatness.append(float(np.mean(sf_vals)))
            except ImportError:
                pass
        except Exception as e:
            logger.warning("Failed to analyze %s: %s", p, e)

    if all_rms:
        rms_arr = np.array(all_rms)
        profile.energy_mean = float(np.mean(rms_arr))
        profile.energy_std = float(np.std(rms_arr))
        rms_db = 20.0 * np.log10(np.maximum(rms_arr, 1e-8))
        profile.dynamic_range_db = float(np.max(rms_db) - np.min(rms_db))

    if all_unvoiced_ratios:
        profile.unvoiced_ratio = float(np.mean(all_unvoiced_ratios))

    if all_spectral_centroid:
        profile.spectral_centroid = float(np.mean(all_spectral_centroid))

    if all_spectral_flatness:
        profile.spectral_flatness = float(np.mean(all_spectral_flatness))

    return profile


def _compute_profile_centroid(
    embeddings: list[np.ndarray],
    voice_id: str,
    sample_count: int,
) -> list[float]:
    """Build a validated speaker centroid for downstream calibration/evaluation.

    Training-generated voice profiles must never persist an empty or malformed
    centroid. If embedding extraction failed for every segment, the training
    pipeline should surface that as a quality-assessment failure instead of
    silently writing an unusable profile that later collapses identity scoring.
    """
    if not embeddings:
        raise SingingWorkerError(
            f'Failed to extract any speaker embeddings while building the voice profile for "{voice_id}" ({sample_count} segment(s))',
            code='VOICE_PROFILE_INVALID',
        )

    centroid = np.asarray(np.mean(embeddings, axis=0), dtype=np.float32).flatten()
    if centroid.size == 0 or not np.all(np.isfinite(centroid)):
        raise SingingWorkerError(
            f'Computed an invalid speaker centroid while building the voice profile for "{voice_id}"',
            code='VOICE_PROFILE_INVALID',
        )

    return centroid.tolist()


def save_voice_profile(profile: VoiceProfile, path: str) -> None:
    """Save VoiceProfile to JSON file."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(profile.to_json(), encoding="utf-8")
    logger.info("Saved voice profile to %s", path)


def load_voice_profile(path: str) -> VoiceProfile:
    """Load VoiceProfile from JSON file."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    fields = VoiceProfile.__dataclass_fields__
    filtered = {k: v for k, v in data.items() if k in fields}
    return VoiceProfile(**filtered)
