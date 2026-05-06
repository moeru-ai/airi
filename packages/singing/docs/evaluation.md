# Evaluation System

The evaluation system provides a 5-axis quality assessment for trained voice models
and AI Cover outputs, measuring identity fidelity, content preservation, melody accuracy,
naturalness, and artifact detection.

## Architecture

```
evaluation/
├── speaker_similarity.py   # Axis 1: Identity / Timbre
├── content_preservation.py # Axis 2: Intelligibility (CER/WER)
├── melody_accuracy.py      # Axis 3: Pitch / F0 metrics
├── naturalness.py          # Axis 4: MOS / MCD / Loudness
├── composite.py            # ReportCard aggregation, grading, tearing/HNR
└── __main__.py             # CLI entry point
```

## Five Evaluation Axes

### 1. Singer Identity (speaker_similarity.py)

Measures timbre similarity between converted output and target speaker.

- **Primary metric**: Cosine similarity of speaker embeddings
- **Backbone**: resemblyzer d-vector (256-dim, L2-normalized)
- **Range**: 0.0 – 1.0

```python
from airi_singing_worker.evaluation.speaker_similarity import extract_embedding, compute_similarity

emb_ref = extract_embedding("target_singer.wav")
emb_synth = extract_embedding("converted.wav")
similarity = compute_similarity(emb_ref, emb_synth)  # → 0.82
```

### 2. Content Preservation (content_preservation.py)

Measures whether lyrics and pronunciation are preserved after conversion.

- **Primary metrics**: Character Error Rate (CER), Word Error Rate (WER)
- **ASR backend**: faster-whisper (CTranslate2-based Whisper) + jiwer for error rates
- `content_score = 1 - CER` (stored in ReportCard)

### 3. Melody Accuracy (melody_accuracy.py)

Measures pitch tracking fidelity.

| Metric | Description |
|--------|-------------|
| F0 Correlation | Pearson correlation of voiced F0 contours |
| F0 RMSE (cents) | RMS error in musical cents |
| Semitone Accuracy | Fraction of frames within ±50 cents |
| VUV Error Rate | Voiced/unvoiced boundary mismatch rate |

- **F0 extractor**: rvc_python.lib.rmvpe.RMVPE (matching training and inference pipelines)

### 4. Naturalness (naturalness.py)

Measures audio quality and naturalness.

| Metric | Description |
|--------|-------------|
| MCD | Mel Cepstral Distortion (with-reference) |
| Loudness RMSE | ITU-R BS.1770 loudness difference (pyloudnorm) |
| MOS | Mean Opinion Score prediction (NISQA-TTS) |

### 5. Artifact Detection (composite.py)

Detects electronic artifacts and measures voice naturalness.

| Metric | Description | Good Value |
|--------|-------------|------------|
| Tearing Score | Spectral flux anomaly in 6-16kHz band (synth vs ref) | < 0.4 |
| HNR | Harmonics-to-Noise Ratio via autocorrelation (dB) | > 15 dB |

**Tearing Score** computes the ratio of high-frequency spectral flux between the
synthesized and reference audio. Values > 0.4 indicate electronic tearing artifacts:

```
ratio = mean(HF_flux_synth) / mean(HF_flux_ref)
tearing_score = clamp((ratio - 1.0) / 3.0, 0.0, 1.0)
```

**HNR** (Harmonics-to-Noise Ratio) uses autocorrelation on voiced frames to measure
the ratio of harmonic to inharmonic energy. Natural singing voice typically has
15-25 dB HNR; electronic artifacts cause HNR < 10 dB.

## ReportCard

The `composite.py` module aggregates all metrics into a `ReportCard` dataclass:

```python
@dataclass
class ReportCard:
    voice_id: str
    singer_similarity: float    # 0-1
    content_score: float        # 0-1 (= 1 - CER)
    f0_corr: float              # -1 to 1
    f0_rmse_cents: float
    st_accuracy: float          # 0-1
    vuv_error: float            # 0-1
    mcd: float
    loudness_rmse: float
    naturalness_mos: float      # 1-5
    tearing_score: float        # 0-1 (0 = no tearing)
    hnr: float                  # dB (higher = more natural)
    per_bucket_scores: dict     # per F0 bucket breakdown
    worst_samples: list[dict]
    overall_grade: str          # A/B/C/D/F
```

### Grading

Overall grade is computed from a weighted composite of the four primary axes:

```
composite = 0.25 × singer_sim + 0.25 × content + 0.25 × f0_corr + 0.25 × mos_norm
```

| Threshold | Grade |
|-----------|-------|
| ≥ 0.85    | A     |
| ≥ 0.70    | B     |
| ≥ 0.55    | C     |
| ≥ 0.40    | D     |
| < 0.40    | F     |

### Failure Classification

When identifying failure modes in worst-sample analysis:

| Failure Type | Trigger |
|-------------|---------|
| `low_identity` | singer_similarity < 0.5 |
| `lyric_drop` | content_score < 0.5 |
| `pitch_instability` | f0_corr < 0.7 |
| `high_note_instability` | f0_rmse_cents > 200 |
| `vuv_boundary_error` | vuv_error > 0.3 |
| `spectral_distortion` | mcd > 10 |
| `low_naturalness` | naturalness_mos < 2.5 |
| `electronic_tearing` | tearing_score > 0.4 |
| `low_hnr_electronic` | hnr < 10.0 dB |

### Batch Evaluation

`run_evaluation_batch` accepts `(ref_path, synth_path, bucket_tag)` triples, computes per-bucket
scores, and identifies the 5 worst samples with failure reason classification.

## CLI Usage

```bash
# Single pair evaluation
python -m airi_singing_worker.evaluation evaluate \
  --ref reference.wav --synth converted.wav --voice-id my_model

# Batch evaluation (directory of paired files)
python -m airi_singing_worker.evaluation batch \
  --ref-dir holdout/ref/ --synth-dir holdout/synth/ --voice-id my_model
```

## Integration with Training

During training (`training_pipeline.py`), the system:

1. Splits the dataset into train/holdout (default 85/15 ratio)
2. Tags holdout segments with F0 buckets (low/mid/high)
3. After training, builds a `voice_profile.json`
4. Runs batch evaluation on holdout pairs
5. Saves `validation_report.json` with the full ReportCard
6. All artifacts are stored in `models/voice_models/{voiceId}/`

## Dependencies

All dependencies are **required** — the pipeline uses a zero-fallback architecture.
Missing dependencies cause immediate errors with install instructions.

Core:
- `numpy`, `soundfile`, `librosa`

Evaluation:
- `rvc-python` — RMVPE F0 extraction (matching training/inference)
- `resemblyzer` — d-vector speaker embeddings (256-dim)
- `faster-whisper` — ASR for CER/WER
- `jiwer` — WER/CER calculation
- `pyloudnorm` — ITU-R BS.1770 loudness
- `nisqa` — Neural MOS prediction

See `packages/singing/python/DEPENDENCIES.md` for the full dependency reference.
