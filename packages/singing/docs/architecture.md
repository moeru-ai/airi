# Architecture

## Overview

`@proj-airi/singing` follows a layered architecture with clear separation between
TypeScript orchestration and Python model inference.

```
src/                                    TypeScript (orchestration + pipeline)
  constants/       Enums, defaults, file format specs
  types/           Pure TypeScript types
  contracts/       Cross-layer communication contracts (StageResult, etc.)
  domain/          Business entities, value objects, policies
  application/     Use cases, orchestrators, service interfaces
  pipeline/        Stage-based pipeline engine
    stages/        9 individual pipeline stage implementations
    context.ts     PipelineContext shared across stages
  adapters/        Backend implementations
    converter/     RVC / Seed-VC adapters + default params
    runtime/       Process runner, environment resolver
    ffmpeg/        FFmpeg filter builders
  manifests/       Job manifest templates, artifact layout definitions
  presets/         Named configuration presets (default, clean, anime, etc.)
  calibration/     TypeScript calibration type definitions
  utils/           Shared utilities (hashing, paths, temp files)
  workers/         Job execution coordination

python/src/airi_singing_worker/         Python (model inference + DSP)
  backends/
    separator/     MelBand-RoFormer, BS-RoFormer vocal separation
    pitch/         RMVPE F0 extraction
    converter/     RVC inference (index loading, F0 passthrough, SR alignment)
    postprocessor/ DSP chain: Noise Gate, HF Augmentation, De-essing
  calibration/     Voice profile, source analysis, param prediction, gate, retry
  evaluation/      5-axis quality evaluation (identity, content, melody, naturalness, artifacts)
  training/        RVC GAN fine-tuning (train loop, config, schedulers, data loading)
  pipelines/       Training pipeline orchestration
  io/              File I/O utilities
  compat/          Compatibility patches (torch load, etc.)
  errors/          Domain-specific exception hierarchy
```

## Data Flow: AI Cover Pipeline

```
Input (mp3/wav/video)
  │
  ├─[1. PrepareSource]──── FFmpeg: extract + transcode to 44.1kHz WAV
  │
  ├─[2. SeparateVocals]─── MelBand-RoFormer: vocals.wav + instrumental.wav
  │
  ├─[3. ExtractF0]──────── RMVPE: f0.npy pitch contour
  │
  ├─[4. AutoCalibrate]──── Analyze source features + load voice profile
  │                        → Predict optimal pitch_shift, index_rate,
  │                          filter_radius, protect, rms_mix_rate
  │
  ├─[5. ConvertVocals]──── RVC: timbre conversion
  │                        → Pre-align 44.1kHz → 40kHz (model native SR)
  │                        → Load FAISS index, pass F0 file, set filter_radius
  │                        → Post-align 40kHz → 44.1kHz
  │
  ├─[6. PostprocessVocals]─ Python DSP chain:
  │                        → Noise Gate (-40dB, 5ms attack, 50ms release)
  │                        → HF Augmentation (6-16kHz from source, 0.35 mix)
  │                        → De-essing (2-8kHz, 4:1 ratio)
  │
  ├─[7. Remix]───────────── FFmpeg: sidechain compress + amix + loudnorm
  │
  ├─[8. QualityGate]─────── Validation: singer_sim, f0_corr, leakage, tearing
  │                         → [fail] → Adjust params → Retry (max 3x)
  │
  └─[9. Finalize]────────── Write manifest.json with full audit trail
                            → Output: final_cover.wav + manifest.json
```

## Data Flow: Voice Model Training

```
Training Audio (wav)
  │
  ├─ Preprocess: resample to 40kHz, slice (4s/0.3s overlap), normalize
  │
  ├─ Feature Extract: HuBERT embeddings, F0, speaker ID
  │
  ├─ GAN Training Loop:
  │    Generator (SynthesizerTrnMs768NSFsid)
  │    Discriminator (MultiPeriodDiscriminatorV2)
  │    ├─ Warmup + Cosine Annealing LR
  │    ├─ Multi-scale Mel Loss + KL Loss + GAN Loss
  │    ├─ R1 Gradient Penalty (every 16 steps)
  │    ├─ EMA weights (from epoch 20, decay 0.999)
  │    ├─ Best-model checkpoint by validation mel loss
  │    └─ Early stopping (patience 200 epochs)
  │
  ├─ Post-training:
  │    ├─ Build voice_profile.json (embedding centroid, F0 stats)
  │    ├─ Run 4-axis evaluation → validation_report.json
  │    └─ Convert checkpoint to inference format
  │
  └─ Output: models/voice_models/{voiceId}/
       ├─ {voiceId}.pth, {voiceId}.index
       ├─ voice_profile.json, validation_report.json, meta.json
```

## Key Design Decisions

1. **File-based contracts**: Each pipeline stage reads/writes files to disk. No in-memory audio passing between stages. This enables stage-level restartability and debugging.

2. **Python subprocess isolation**: All model inference (separation, pitch, conversion, post-processing, evaluation, training) runs in a separate Python process via `node:child_process.spawn`. This prevents GPU memory leaks and allows independent Python dependency management.

3. **Adapter pattern**: All backends (separator, pitch extractor, converter) implement a common TypeScript interface. Swapping backends (e.g., RVC → Seed-VC) requires no pipeline changes.

4. **Sample rate pre-alignment**: The RVC model trains at 40kHz but the pipeline operates at 44.1kHz. High-quality librosa resampling bridges this gap before and after conversion to prevent aliasing artifacts.

5. **Two-layer calibration**: Per-voice calibration (voice profile) establishes baseline parameters; per-song refinement adjusts for each input's characteristics.

6. **Best-model selection**: Training saves the checkpoint with the lowest validation mel loss, not the latest epoch. This prevents overfitting degradation.

7. **Single package**: Everything lives under `packages/singing` to minimize monorepo sprawl while keeping clear internal boundaries via the layered directory structure.

## Cross-Process Communication

```
TypeScript (Node.js)                    Python (subprocess)
  │                                       │
  ├─ spawn(pythonPath, ['-m', module])    │
  │    └──── stdin/stdout/stderr ─────────┤
  │         └── JSON on stdout            │
  │         └── Logs on stderr            │
  │                                       │
  ├─ progress.json polling (training)     │
  │    └──── setInterval(2s) read file ───┤
  │                                       │
  └─ Environment variables:               │
       PYTHONPATH, RMVPE_MODEL_PATH,      │
       HUBERT_MODEL_PATH,                 │
       PYTHONUNBUFFERED=1,                │
       PYTHONIOENCODING=utf-8             │
```
