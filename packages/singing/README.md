# @proj-airi/singing

AI singing voice conversion and voice model training pipeline for AIRI.

## Prerequisites

- **FFmpeg** — must be on system PATH (`ffmpeg -version`)
- **Python >= 3.10** — must be on system PATH (`python --version`)
- **uv** — Python package manager ([install guide](https://docs.astral.sh/uv/getting-started/installation/))

## Quick Start

```bash
# 1. Validate runtime dependencies
pnpm -F @proj-airi/singing validate

# 2. Full setup (validate + install Python deps + download models)
pnpm -F @proj-airi/singing setup

# 3. Build the TypeScript package
pnpm -F @proj-airi/singing build
```

## GPU Support

The setup script (`pnpm -F @proj-airi/singing setup`) **automatically detects** your GPU
and installs the correct PyTorch variant:

| Device | Detection | PyTorch Index |
|--------|-----------|---------------|
| **CUDA 12.4+** | `nvidia-smi` reports CUDA ≥ 12.4 | `whl/cu124` |
| **CUDA 12.1** | `nvidia-smi` reports CUDA 12.1–12.3 | `whl/cu121` |
| **CUDA 11.8** | `nvidia-smi` reports CUDA 11.8–12.0 | `whl/cu118` |
| **CPU** | No NVIDIA GPU or CUDA < 11.8 | `whl/cpu` |
| **MPS** | Apple Silicon (auto-detected at runtime) | `whl/cpu` (MPS enabled in torch) |

## Model Storage

```
models/
├── rmvpe.pt                              # Pitch extraction model (auto-downloaded)
├── hubert_base.pt                        # Content encoder for RVC (auto-downloaded)
├── separation/
│   ├── MelBandRoformer.ckpt              # Vocal separation (auto-downloaded)
│   └── config_vocals_mel_band_roformer_kj.yaml
├── pretrained_v2/
│   ├── f0G40k.pth                        # RVC training base generator
│   └── f0D40k.pth                        # RVC training base discriminator
└── voice_models/                         # User-trained voice models
    └── <voiceId>/
        ├── <voiceId>.pth                 # RVC model weights
        ├── <voiceId>.index               # FAISS retrieval index
        ├── voice_profile.json            # Speaker embedding centroid, F0 stats
        ├── validation_report.json        # 4-axis evaluation ReportCard
        └── meta.json                     # Training metadata
```

## AI Cover Pipeline

The full pipeline is orchestrated by the **TypeScript layer** (9 stages).
A standalone **Python fallback** (4 stages) exists for headless use without TS.

### TypeScript Orchestrator (9 Stages)

| # | Stage | Description |
|---|-------|-------------|
| 1 | **Source Preparation** | FFmpeg: transcode to 44.1kHz 16-bit WAV |
| 2 | **Vocal Separation** | MelBand-RoFormer: split vocals from instrumental |
| 3 | **Pitch Extraction** | RMVPE: extract F0 pitch contour |
| 4 | **Auto-Calibrate** | Analyze source vocal + voice profile → predict optimal RVC params |
| 5 | **Voice Conversion** | RVC: timbre conversion with index retrieval, F0 passthrough, filter_radius |
| 6 | **Post-processing** | Python DSP chain: Noise Gate → HF Augmentation → De-essing |
| 7 | **Remix & Mix** | FFmpeg: sidechain compress, mix vocals + instrumental, loudnorm |
| 8 | **Quality Gate** | Validation gate: singer similarity, F0 corr, tearing risk |
| 9 | **Finalize** | Write manifest.json with full audit trail |

### Python Standalone (4 Stages)

Used by `python -m airi_singing_worker.pipelines.cover_pipeline` without the TS layer:

| # | Stage | Description |
|---|-------|-------------|
| 1 | **Vocal Separation** | MelBand/BS-RoFormer |
| 2 | **Pitch Extraction** | RMVPE |
| 3 | **Voice Conversion** | RVC / Seed-VC |
| 4 | **Remix** | FFmpeg |

## Voice Model Training

Train custom voice models from audio data via RVC GAN fine-tuning:

- **Epoch-level GAN training** with pretrained RVC v2 40kHz checkpoints
- **Warmup + Cosine Annealing** learning rate schedule
- **EMA** (Exponential Moving Average) for stable generator weights
- **Best-model selection** by validation mel loss (not just latest checkpoint)
- **Multi-scale mel loss** (BigVGAN-v2 style)
- **R1 gradient penalty** for discriminator regularization
- **BFloat16** mixed precision on Ampere+ GPUs
- **Real-time progress** tracking via `progress.json`

## Post-processing DSP Chain

After voice conversion, a Python-based DSP pipeline removes electronic artifacts:

1. **Noise Gate** — Attenuate signal below -40dB RMS threshold (attack 5ms, release 50ms)
2. **High-frequency Augmentation** — Blend 6-16kHz content from source vocals into converted output (SYKI-SVC inspired, mix ratio 0.35)
3. **De-essing** — Dynamic compression on 2-8kHz sibilant band (ratio 4:1)

## Auto-Calibration

Per-song automatic parameter tuning:

- **Pitch Shift**: F0 median matching with overflow penalty
- **Index Rate**: Embedding mismatch + quality gap + content risk
- **Protect**: Unvoiced ratio + sibilance + tearing risk + spectral flatness
- **RMS Mix Rate**: Source dynamic range driven
- **Filter Radius**: Median filtering for F0 smoothing (default 3)

Failed validation triggers automatic retry with adjusted parameters (up to 3 attempts).

## Evaluation System

5-axis voice model quality assessment:

| Axis | Metrics | Range |
|------|---------|-------|
| **Identity** | Speaker embedding cosine similarity | 0–1 |
| **Content** | CER/WER via ASR | 0–1 |
| **Melody** | F0 correlation, F0 RMSE, Semitone Accuracy, VUV Error | 0–1 |
| **Naturalness** | MOS prediction, MCD, Loudness RMSE | 1–5 |
| **Artifacts** | Tearing score (HF spectral flux), HNR | 0–1 / dB |

## Architecture

```
src/
  constants/       Enums, defaults, file format specs
  types/           Pure TypeScript types
  contracts/       Cross-layer communication contracts
  domain/          Domain entities, value objects, policies
  application/     Use cases, orchestrators, service layer
  pipeline/        Stage-based pipeline engine
    stages/        Individual pipeline stage implementations
  adapters/        Backend adapters (FFmpeg, RoFormer, RMVPE, RVC, Seed-VC)
    converter/
      params/      Default parameter sets (RVC, Seed-VC)
  manifests/       Job manifest templates and artifact layout
  presets/         Quality / latency / model selection presets
  calibration/     Auto-calibration type definitions
  utils/           Hashing, paths, temp files
  workers/         TS-side worker coordination

python/src/airi_singing_worker/
  backends/
    separator/     MelBand-RoFormer, BS-RoFormer
    pitch/         RMVPE F0 extraction
    converter/     RVC inference (with index loading, F0 passthrough, SR pre-alignment)
    postprocessor/ Noise Gate, HF Augmentation, De-essing
  calibration/     Voice profile, source analysis, param prediction, validation gate, retry
  evaluation/      Speaker similarity, content preservation, melody accuracy, naturalness, composite
  training/        GAN fine-tuning loop, config, schedulers, data loading
  pipelines/       Training pipeline orchestration
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AIRI_SINGING_FFMPEG_PATH` | `ffmpeg` | Path to FFmpeg binary |
| `AIRI_SINGING_PYTHON_PATH` | `python` | Path to Python binary |
| `AIRI_SINGING_MODELS_DIR` | `<pkg>/models` | Model weights directory |
| `AIRI_SINGING_TEMP_DIR` | `<pkg>/.singing-tmp` | Temporary files and job artifacts |
| `AIRI_SINGING_PYTHON_SRC` | `<pkg>/python/src` | Python source for PYTHONPATH |

## Usage

```ts
import type { CreateCoverRequest } from '@proj-airi/singing/types'

import { createCoverJob, runCoverPipeline } from '@proj-airi/singing'
```

## Documentation

- [Architecture](docs/architecture.md) — Layered design, data flow, key decisions
- [Pipeline](docs/pipeline.md) — 9-stage pipeline details and artifact layout
- [Training](docs/training.md) — RVC GAN fine-tuning, hyperparameters, best-model selection
- [Calibration](docs/calibration.md) — Auto-calibration formulas, validation gate, retry strategy
- [Evaluation](docs/evaluation.md) — 5-axis ReportCard, grading, batch evaluation
- [Artifacts](docs/artifacts.md) — File contracts, manifest schema, voice model storage
- [Model Backends](docs/model-backends.md) — Separator, pitch, converter, post-processing backends
