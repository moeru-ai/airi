"""Composite evaluation: ReportCard with 4-axis scores, per-bucket breakdown, grading."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

from . import speaker_similarity, content_preservation, melody_accuracy, naturalness

logger = logging.getLogger(__name__)

# Default weights for overall grade computation
DEFAULT_WEIGHTS = {
    "singer_similarity": 0.25,
    "content_score": 0.25,
    "f0_corr": 0.25,
    "naturalness_mos": 0.25,
}

GRADE_THRESHOLDS = [
    (0.85, "A"),
    (0.70, "B"),
    (0.55, "C"),
    (0.40, "D"),
]


@dataclass
class BucketScore:
    bucket_tag: str
    singer_similarity: float = 0.0
    content_score: float = 0.0
    f0_corr: float = 0.0
    naturalness_mos: float = 3.0
    sample_count: int = 0


@dataclass
class WorstSample:
    filename: str
    failure_reason: str
    score: float = 0.0


@dataclass
class ReportCard:
    voice_id: str
    singer_similarity: float = 0.0
    content_score: float = 0.0
    f0_corr: float = 0.0
    f0_rmse_cents: float = 0.0
    st_accuracy: float = 0.0
    vuv_error: float = 0.0
    mcd: float = 0.0
    loudness_rmse: float = 0.0
    naturalness_mos: float = 3.0
    tearing_score: float = 0.0
    hnr: float = 0.0
    per_bucket_scores: dict[str, Any] = field(default_factory=dict)
    worst_samples: list[dict[str, Any]] = field(default_factory=list)
    overall_grade: str = "C"

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    @classmethod
    def from_dict(cls, d: dict) -> "ReportCard":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})

    @classmethod
    def from_json(cls, path: str) -> "ReportCard":
        with open(path) as f:
            return cls.from_dict(json.load(f))


def compute_overall_grade(
    card: ReportCard,
    weights: dict[str, float] | None = None,
) -> str:
    """Map weighted composite score to letter grade A/B/C/D/F."""
    w = weights or DEFAULT_WEIGHTS

    # Normalize scores to 0-1 range
    sim = card.singer_similarity  # already 0-1
    content = max(0.0, 1.0 - card.content_score) if card.content_score > 1.0 else max(0.0, card.content_score)
    # content_score is stored as 1-CER, so already 0-1
    f0 = max(0.0, min(1.0, card.f0_corr))
    # MOS 1-5 → normalized to 0-1
    mos_norm = max(0.0, min(1.0, (card.naturalness_mos - 1.0) / 4.0))

    composite = (
        w.get("singer_similarity", 0.3) * sim
        + w.get("content_score", 0.2) * content
        + w.get("f0_corr", 0.25) * f0
        + w.get("naturalness_mos", 0.25) * mos_norm
    )

    for threshold, grade in GRADE_THRESHOLDS:
        if composite >= threshold:
            return grade
    return "F"


def run_evaluation(
    ref_audio: str,
    synth_audio: str,
    voice_profile_data: dict | None = None,
    voice_id: str = "unknown",
) -> ReportCard:
    """Run full 4-axis evaluation on a single reference/synthesis pair.

    Args:
        ref_audio: Path to reference audio (original vocal or holdout segment).
        synth_audio: Path to synthesized/converted audio.
        voice_profile_data: Optional dict with 'embedding_centroid' for similarity.
        voice_id: Identifier for the voice model.

    Returns:
        ReportCard with all metrics populated.
    """
    card = ReportCard(voice_id=voice_id)

    # Axis 1: Singer Identity
    try:
        synth_emb = speaker_similarity.extract_embedding(synth_audio)
        ref_emb = _resolve_identity_reference_embedding(
            ref_audio=ref_audio,
            synth_emb=synth_emb,
            voice_profile_data=voice_profile_data,
        )
        card.singer_similarity = speaker_similarity.compute_similarity(ref_emb, synth_emb)
    except Exception as e:
        logger.warning("Singer identity evaluation failed: %s", e)

    # Axis 2: Content Preservation
    try:
        ref_text = content_preservation.transcribe_audio(ref_audio)
        synth_text = content_preservation.transcribe_audio(synth_audio)
        if ref_text and synth_text:
            cer = content_preservation.compute_cer(ref_text, synth_text)
            card.content_score = max(0.0, 1.0 - cer)
        else:
            card.content_score = 0.5  # neutral if ASR unavailable
    except Exception as e:
        logger.warning("Content preservation evaluation failed: %s", e)
        card.content_score = 0.5

    # Axis 3: Melody Accuracy
    try:
        f0_ref = melody_accuracy.extract_f0_from_audio(ref_audio)
        f0_synth = melody_accuracy.extract_f0_from_audio(synth_audio)
        card.f0_corr = melody_accuracy.f0_correlation(f0_ref, f0_synth)
        card.f0_rmse_cents = melody_accuracy.f0_rmse_cents(f0_ref, f0_synth)
        card.st_accuracy = melody_accuracy.semitone_accuracy(f0_ref, f0_synth)
        card.vuv_error = melody_accuracy.vuv_error_rate(f0_ref, f0_synth)
    except Exception as e:
        logger.warning("Melody accuracy evaluation failed: %s", e)

    # Axis 4: Naturalness
    try:
        card.mcd = naturalness.compute_mcd(ref_audio, synth_audio)
        card.loudness_rmse = naturalness.compute_loudness_rmse(ref_audio, synth_audio)
        card.naturalness_mos = naturalness.predict_mos(synth_audio)
    except Exception as e:
        logger.warning("Naturalness evaluation failed: %s", e)

    # Axis 5: Artifact Detection
    try:
        card.tearing_score = _compute_tearing_score(synth_audio, ref_audio)
    except Exception as e:
        logger.warning("Tearing score computation failed: %s", e)

    try:
        card.hnr = _compute_hnr(synth_audio)
    except Exception as e:
        logger.warning("HNR computation failed: %s", e)

    card.overall_grade = compute_overall_grade(card)
    return card


def _resolve_identity_reference_embedding(
    ref_audio: str,
    synth_emb: np.ndarray,
    voice_profile_data: dict | None = None,
) -> np.ndarray:
    """Choose the reference embedding for identity scoring.

    Validates voice profile centroid data integrity before use. If the
    centroid is missing, empty, or shape-mismatched, uses the reference
    audio embedding directly as the identity target.
    """
    centroid_values = None
    if voice_profile_data:
        centroid_values = voice_profile_data.get("embedding_centroid")

    if centroid_values is not None:
        try:
            centroid = np.asarray(centroid_values, dtype=np.float32).flatten()
            if centroid.size == 0:
                logger.warning(
                    "Voice profile centroid is empty; using reference audio embedding for identity scoring",
                )
            elif centroid.shape != synth_emb.shape:
                logger.warning(
                    "Voice profile centroid shape %s does not match synthesized embedding shape %s; using reference audio embedding instead",
                    centroid.shape,
                    synth_emb.shape,
                )
            else:
                return centroid
        except Exception as e:
            logger.warning(
                "Voice profile centroid is invalid for identity scoring (%s); using reference audio embedding instead",
                e,
            )

    return speaker_similarity.extract_embedding(ref_audio)


def run_evaluation_batch(
    pairs: list[tuple[str, str, str]],
    voice_profile_data: dict | None = None,
    voice_id: str = "unknown",
) -> ReportCard:
    """Run evaluation on multiple (ref_audio, synth_audio, tag) triples and aggregate.

    Args:
        pairs: List of (ref_path, synth_path, bucket_tag) tuples.
        voice_profile_data: Optional voice profile dict.
        voice_id: Identifier for the voice model.

    Returns:
        Aggregated ReportCard with per_bucket_scores and worst_samples.
    """
    all_cards: list[tuple[ReportCard, str, str]] = []
    bucket_cards: dict[str, list[ReportCard]] = {}

    for ref_path, synth_path, tag in pairs:
        card = run_evaluation(ref_path, synth_path, voice_profile_data, voice_id)
        all_cards.append((card, tag, Path(synth_path).name))

        if tag not in bucket_cards:
            bucket_cards[tag] = []
        bucket_cards[tag].append(card)

    if not all_cards:
        return ReportCard(voice_id=voice_id)

    # Aggregate global scores
    agg = ReportCard(voice_id=voice_id)
    agg.singer_similarity = float(np.mean([c.singer_similarity for c, _, _ in all_cards]))
    agg.content_score = float(np.mean([c.content_score for c, _, _ in all_cards]))
    agg.f0_corr = float(np.mean([c.f0_corr for c, _, _ in all_cards]))
    agg.f0_rmse_cents = float(np.mean([c.f0_rmse_cents for c, _, _ in all_cards]))
    agg.st_accuracy = float(np.mean([c.st_accuracy for c, _, _ in all_cards]))
    agg.vuv_error = float(np.mean([c.vuv_error for c, _, _ in all_cards]))
    agg.mcd = float(np.mean([c.mcd for c, _, _ in all_cards]))
    agg.loudness_rmse = float(np.mean([c.loudness_rmse for c, _, _ in all_cards]))
    agg.naturalness_mos = float(np.mean([c.naturalness_mos for c, _, _ in all_cards]))
    agg.tearing_score = float(np.mean([c.tearing_score for c, _, _ in all_cards]))
    agg.hnr = float(np.mean([c.hnr for c, _, _ in all_cards]))

    # Per-bucket scores
    for tag, cards in bucket_cards.items():
        bs = BucketScore(
            bucket_tag=tag,
            singer_similarity=float(np.mean([c.singer_similarity for c in cards])),
            content_score=float(np.mean([c.content_score for c in cards])),
            f0_corr=float(np.mean([c.f0_corr for c in cards])),
            naturalness_mos=float(np.mean([c.naturalness_mos for c in cards])),
            sample_count=len(cards),
        )
        agg.per_bucket_scores[tag] = asdict(bs)

    # Worst samples: bottom 5 by composite score
    scored = []
    for card, tag, fname in all_cards:
        comp = (card.singer_similarity + card.content_score + card.f0_corr) / 3.0
        failure = _identify_failure(card)
        scored.append((comp, fname, failure))
    scored.sort(key=lambda x: x[0])
    agg.worst_samples = [
        asdict(WorstSample(filename=fname, failure_reason=reason, score=round(sc, 3)))
        for sc, fname, reason in scored[:5]
    ]

    agg.overall_grade = compute_overall_grade(agg)
    return agg


def _identify_failure(card: ReportCard) -> str:
    """Identify the primary failure mode from a ReportCard."""
    issues = []
    if card.singer_similarity < 0.5:
        issues.append("low_identity")
    if card.content_score < 0.5:
        issues.append("lyric_drop")
    if card.f0_corr < 0.7:
        issues.append("pitch_instability")
    if card.f0_rmse_cents > 200:
        issues.append("high_note_instability")
    if card.vuv_error > 0.3:
        issues.append("vuv_boundary_error")
    if card.mcd > 10:
        issues.append("spectral_distortion")
    if card.naturalness_mos < 2.5:
        issues.append("low_naturalness")
    if card.tearing_score > 0.4:
        issues.append("electronic_tearing")
    if card.hnr < 10.0:
        issues.append("low_hnr_electronic")
    return ", ".join(issues) if issues else "acceptable"


def _compute_tearing_score(synth_path: str, ref_path: str) -> float:
    """Quantify electronic tearing artifacts via spectral flux anomaly in 6-16kHz.

    Compares high-frequency spectral flux between synthesized and reference audio.
    High divergence indicates tearing/electronic artifacts.

    Returns:
        0.0-1.0 where 0 = no tearing, 1 = severe tearing.
    """
    synth_data, synth_sr = sf.read(synth_path, dtype="float32")
    ref_data, ref_sr = sf.read(ref_path, dtype="float32")

    if synth_data.ndim > 1:
        synth_data = synth_data.mean(axis=1)
    if ref_data.ndim > 1:
        ref_data = ref_data.mean(axis=1)

    n_fft = 2048
    hop = n_fft // 2

    synth_flux = _hf_spectral_flux(synth_data, synth_sr, n_fft, hop)
    ref_flux = _hf_spectral_flux(ref_data, ref_sr, n_fft, hop)

    min_len = min(len(synth_flux), len(ref_flux))
    if min_len < 5:
        return 0.0

    synth_flux = synth_flux[:min_len]
    ref_flux = ref_flux[:min_len]

    ref_mean = np.mean(ref_flux) + 1e-8
    synth_mean = np.mean(synth_flux)
    ratio = synth_mean / ref_mean

    return float(np.clip((ratio - 1.0) / 3.0, 0.0, 1.0))


def _hf_spectral_flux(
    data: np.ndarray, sr: int, n_fft: int, hop: int,
) -> np.ndarray:
    """Compute spectral flux in 6-16kHz band."""
    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    hf_mask = (freq_bins >= 6000) & (freq_bins <= min(16000, sr // 2))

    n_frames = max(1, (len(data) - n_fft) // hop + 1)
    prev_spectrum = None
    flux = np.zeros(n_frames)

    for i in range(n_frames):
        start = i * hop
        frame = data[start:start + n_fft]
        if len(frame) < n_fft:
            break
        spectrum = np.abs(np.fft.rfft(frame * np.hanning(n_fft)))
        hf = spectrum[hf_mask]

        if prev_spectrum is not None:
            diff = hf - prev_spectrum
            flux[i] = float(np.sum(np.maximum(diff, 0) ** 2))
        prev_spectrum = hf

    return flux


def _compute_hnr(audio_path: str) -> float:
    """Compute Harmonics-to-Noise Ratio (HNR) in dB.

    Higher HNR = more harmonic (natural voice), lower HNR = more noise (electronic).
    Typical natural singing: 15-25 dB. Electronic artifacts: < 10 dB.

    Uses autocorrelation method on voiced segments only.
    """
    data, sr = sf.read(audio_path, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)

    frame_len = int(0.03 * sr)  # 30ms frames
    hop = frame_len // 2
    n_frames = max(1, (len(data) - frame_len) // hop + 1)

    hnr_values = []
    for i in range(n_frames):
        start = i * hop
        frame = data[start:start + frame_len]
        if len(frame) < frame_len:
            break

        rms = np.sqrt(np.mean(frame ** 2))
        if rms < 1e-4:
            continue

        autocorr = np.correlate(frame, frame, mode="full")
        autocorr = autocorr[len(autocorr) // 2:]

        if autocorr[0] < 1e-10:
            continue

        autocorr_norm = autocorr / autocorr[0]

        # Search for first peak after minimum period (50Hz = sr/50 samples)
        min_lag = max(2, int(sr / 500))  # 500Hz max
        max_lag = min(len(autocorr_norm) - 1, int(sr / 50))  # 50Hz min

        if max_lag <= min_lag:
            continue

        peak_idx = min_lag + np.argmax(autocorr_norm[min_lag:max_lag + 1])
        peak_val = autocorr_norm[peak_idx]

        if peak_val > 0.0 and peak_val < 1.0:
            hnr_db = 10.0 * np.log10(peak_val / (1.0 - peak_val + 1e-10))
            hnr_values.append(hnr_db)

    if not hnr_values:
        return 0.0

    return float(np.median(hnr_values))


def check_thresholds(
    card: ReportCard,
    thresholds: dict[str, float] | None = None,
) -> bool:
    """Check if all metrics meet minimum thresholds.

    Default thresholds are lenient — intended as a "minimum viable quality" gate.
    """
    defaults = {
        "singer_similarity": 0.55,
        "content_score": 0.45,
        "f0_corr": 0.75,
        "naturalness_mos": 2.5,
    }
    t = {**defaults, **(thresholds or {})}

    return (
        card.singer_similarity >= t["singer_similarity"]
        and card.content_score >= t["content_score"]
        and card.f0_corr >= t["f0_corr"]
        and card.naturalness_mos >= t["naturalness_mos"]
    )
