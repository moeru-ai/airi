# Auto-Calibration System

The calibration system automatically adjusts RVC inference parameters for each song,
ensuring the converted output matches the target voice model's timbre while preserving
content intelligibility and minimizing electronic artifacts.

## Architecture

```
calibration/
├── voice_profile.py     # Per-model audio characteristics
├── source_analyzer.py   # Input vocal feature extraction
├── param_predictor.py   # Mathematical parameter prediction
├── validation_gate.py   # Post-inference quality check
├── retry_strategy.py    # Parameter adjustment on failure
└── __main__.py          # CLI entry point
```

## Two-Layer Closed Loop

```
┌─────────────────────────────────────────────────────┐
│                  Per-Voice Calibration               │
│  Training data → Voice Profile (embedding, F0, etc.) │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│                  Per-Song Refinement                 │
│  Source vocals → Feature Analysis → Param Prediction │
│       ↓                                              │
│  RVC Inference → Validation Gate                     │
│       ↓              ↓                               │
│  [pass] → Output   [fail] → Adjust Params → Retry   │
└─────────────────────────────────────────────────────┘
```

## Voice Profile (voice_profile.py)

Built from training data after model training:

```python
@dataclass
class VoiceProfile:
    voice_id: str
    embedding_centroid: list[float]   # Speaker embedding average
    f0_p10: float                     # F0 10th percentile
    f0_p50: float                     # F0 median
    f0_p90: float                     # F0 90th percentile
    energy_mean: float
    energy_std: float
    dynamic_range_db: float
    unvoiced_ratio: float
    spectral_centroid: float
    spectral_flatness: float
```

## Source Analysis (source_analyzer.py)

Extracts features from the input vocal that drive parameter prediction:

```python
@dataclass
class SourceFeatures:
    f0_median: float
    f0_p10: float
    f0_p90: float
    speaker_embedding: list[float]
    dynamic_range: float          # 0-1 normalized
    unvoiced_ratio: float
    sibilance_score: float        # 4-8 kHz energy ratio, normalized 0-1
    spectral_flatness: float
    source_quality: float         # MOS estimate
```

## Predicted Parameters

```python
@dataclass
class PredictedParams:
    pitch_shift: int = 0
    index_rate: float = 0.75
    filter_radius: int = 3        # F0 median smoothing
    protect: float = 0.20
    rms_mix_rate: float = 0.25
```

## Parameter Prediction Formulas

### Pitch Shift

Matches source F0 range to target model's comfortable range:

```
k* = argmin_k [λ₁ · |12·log₂((S50·2^(k/12)) / T50)| + λ₂ · overflow_penalty(k)]
```

Where:
- `S50` = source F0 median, `T50` = target F0 median
- `k ∈ {-12, ..., 12}` (integer semitones)
- `overflow_penalty` penalizes shifts that push source out of target's p10-p90 range
- Default: `λ₁ = 1.0, λ₂ = 0.5`

### Index Rate

Controls how much the output leans toward trained timbre vs source timbre.
Incorporates content risk to preserve intelligibility:

```
index_rate = clamp(
    0.35
    + 0.30 · mismatch
    - 0.25 · max(0, Qs - Qt)
    + 0.10 · leakage
    - 0.20 · content_risk,
    0.10, 0.90
)
```

Where:
- `mismatch` = 1 - cosine_similarity(source_embedding, target_centroid)
- `Qs` = source audio quality (MOS), `Qt` = target training data quality (default 3.5)
- `leakage` = source leakage risk (0 initially, updated in retry loop)
- `content_risk` = content degradation risk from previous inference (0-1)

When content_risk is high (previous inference had low content score), the index_rate
is reduced to let more source phonetic information pass through.

### Filter Radius

F0 median smoothing window. Always set to 3 (default). This reduces F0 jitter
and breathing artifacts by applying a median filter to the extracted pitch contour.

### Protect

Prevents consonant and sibilant tearing. Incorporates spectral flatness
and tearing risk feedback:

```
protect = clamp(
    0.45
    - 0.20 · unvoiced_ratio
    - 0.15 · sibilance
    - 0.10 · tearing_risk
    - 0.10 · spectral_flatness,
    0.10, 0.50
)
```

Lower values = stronger protection. Default range: 0.10 – 0.50.

### RMS Mix Rate

Controls output volume envelope:

```
rms_mix_rate = clamp(0.55 - 0.35 · dynamic_range + 0.20 · instability, 0.05, 0.80)
```

Lower values preserve original dynamics; higher values normalize loudness.

## Validation Gate (validation_gate.py)

Post-inference quality check with four checks:

| Check | Metric | Default Threshold |
|-------|--------|-------------------|
| Singer similarity | Embedding cosine sim vs profile centroid | ≥ 0.65 |
| Melody preservation | F0 correlation with source | ≥ 0.85 |
| Source leakage | Embedding sim with source (should be low) | ≤ 0.40 |
| Tearing risk | Spectral flux ratio in 6-16 kHz band | ≤ 0.50 |

### Tearing Detection

Compares high-frequency spectral flux between output and source:

```
ratio = mean(HF_flux_output) / mean(HF_flux_source)
tearing_risk = clamp((ratio - 1.0) / 3.0, 0.0, 1.0)
```

## Retry Strategy (retry_strategy.py)

When the validation gate fails, parameters are adjusted based on which metrics failed:

| Failed Metric | Adjustment |
|---------------|------------|
| `singer_similarity` low | index_rate += 0.15 |
| `source_leakage` high | index_rate += 0.10 |
| `tearing` detected | protect -= 0.08 (min 0.10) |
| `content_score` low | index_rate -= 0.12 |
| `f0_corr` low | pitch_shift ±1 (alternating direction) |

Maximum 3 retry attempts. After all attempts, `select_best_result` picks the run
with the highest composite score:

```
score = 0.4 × singer_sim + 0.3 × f0_corr + 0.3 × (1 - source_leakage)
```

## Pipeline Integration

The auto-calibration system integrates into the cover pipeline as two stages:

1. **AutoCalibrate** (stage 4, after ExtractF0): Analyzes source, loads voice profile, predicts params
2. **QualityGate** (stage 8, after Remix): Runs validation gate on the final output

The `executePipelineAsync` function in the server handles the retry loop:
- Runs the full pipeline
- Checks gate result
- If failed, calls `adjust` CLI → updates params → re-runs ConvertVocals through Evaluate
- Repeats up to 3 times or until gate passes

## CLI Usage

```bash
# Analyze source vocal
python -m airi_singing_worker.calibration analyze --vocal separated_vocal.wav

# Predict parameters
python -m airi_singing_worker.calibration predict \
  --vocal separated_vocal.wav --voice-profile voice_profile.json

# Run validation gate
python -m airi_singing_worker.calibration validate \
  --output converted.wav --source original_vocal.wav \
  --voice-profile voice_profile.json

# Adjust params for retry
python -m airi_singing_worker.calibration adjust \
  --params '{"pitch_shift":0,"index_rate":0.75,"filter_radius":3,"protect":0.20,"rms_mix_rate":0.25}' \
  --gate-result '{"passed":false,"singer_similarity":0.4,"failed_metrics":["singer_similarity"]}' \
  --attempt 1

# Build voice profile from training data
python -m airi_singing_worker.calibration profile \
  --audio-dir training_segments/ --voice-id my_singer --output voice_profile.json
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/models/:voiceId/profile` | Retrieve voice profile JSON |
| GET | `/models/:voiceId/report` | Retrieve validation report JSON |
| POST | `/evaluate` | Run evaluation on uploaded audio |
| POST | `/calibrate` | Predict parameters for uploaded vocal |
