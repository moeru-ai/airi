# AI Cover Pipeline: Required Dependencies

This pipeline follows a **zero-fallback** architecture. Every component has exactly one
implementation backed by one dependency. If a dependency is missing, the system errors
immediately with a clear message — no silent degradation.

## Core Pipeline

| Component | Dependency | Install | Used By |
|---|---|---|---|
| F0 Extraction | `rvc-python` (RMVPE) | `pip install rvc-python` | `rmvpe.py`, `training_pipeline.py`, `melody_accuracy.py` |
| Voice Conversion | `rvc-python` | `pip install rvc-python` | `rvc.py` |
| Audio Mixing | FFmpeg | System package manager | `ffmpeg_mix.py` |
| Vocal Separation | `melband-roformer-infer` | `pip install melband-roformer-infer` | `melband_roformer.py` |
| HuBERT Features | `rvc-python` | `pip install rvc-python` | `training_pipeline.py` |
| Audio Slicing | `rvc-python` | `pip install rvc-python` | `training_pipeline.py` |

## Evaluation

| Component | Dependency | Install | Used By |
|---|---|---|---|
| Speaker Similarity | `resemblyzer` | `pip install resemblyzer` | `speaker_similarity.py` |
| Content Preservation | `faster-whisper`, `jiwer` | `pip install faster-whisper jiwer` | `content_preservation.py` |
| Naturalness MOS | `nisqa` | `pip install nisqa` | `naturalness.py` |
| Loudness RMSE | `pyloudnorm` | `pip install pyloudnorm` | `naturalness.py` |
| MCD (Mel Cepstral) | `librosa` | `pip install librosa` | `naturalness.py` |

## Common

| Component | Dependency | Install |
|---|---|---|
| Audio I/O | `soundfile`, `numpy` | `pip install soundfile numpy` |
| Resampling | `librosa` | `pip install librosa` |

## Environment Variables

| Variable | Description | Required By |
|---|---|---|
| `RMVPE_MODEL_PATH` | Path to `rmvpe.pt` model file | F0 extraction (inference + training + evaluation) |
| `HUBERT_MODEL_PATH` | Path to `hubert_base.pt` model file | HuBERT feature extraction (training) |
| `MELBAND_CKPT_PATH` | Path to MelBand-RoFormer checkpoint | Vocal separation |
| `MELBAND_CONFIG_PATH` | Path to MelBand-RoFormer config YAML | Vocal separation |
| `RVC_PRETRAINED_G_PATH` | Path to pretrained generator `.pth` | Training (required unless `--allow-scratch`) |
| `RVC_PRETRAINED_D_PATH` | Path to pretrained discriminator `.pth` | Training (required unless `--allow-scratch`) |
| `AIRI_SINGING_FFMPEG_PATH` | Path to FFmpeg binary (if not on PATH) | Audio mixing |

## Adapter Weights (Optional — `full` pipeline mode only)

| Variable | Description | Module |
|---|---|---|
| `PITCH_ADAPTER_PATH` | PitchAdapter weights (`.pt`) | `adapters/pitch_adapter.py` |
| `PARAM_CONTROLLER_PATH` | ParamController weights (`.pt`) | `adapters/param_controller.py` |
| `POST_FILTER_PATH` | PostFilter weights (`.pt`) | `adapters/post_filter.py` |

## Pipeline Modes

- **`backbone`** (default): Canonical backbone only. No adapter modules loaded.
  All processing uses deterministic, non-learned components.

- **`full`**: All adapter modules required. Missing weights = startup error
  before any audio processing begins. Adapters refine F0 contours,
  predict RVC parameters, and post-process mel spectrograms.
