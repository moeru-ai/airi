# Pipeline Stages

## TypeScript Orchestrator: 9-Stage AI Cover Pipeline

The full 9-stage pipeline is driven by the TypeScript orchestrator
(`cover-pipeline-orchestrator.ts`), which calls individual Python backends
as subprocesses. A standalone Python fallback (`cover_pipeline.py`) provides
a simpler 4-stage flow (separate → F0 → convert → remix) for headless use
without the TS layer.

| # | Stage | Module | Description |
|---|-------|--------|-------------|
| 1 | `prepare_source` | `prepare-source.stage.ts` | Extract audio, transcode to 44.1kHz 16-bit mono WAV |
| 2 | `separate_vocals` | `separate-vocals.stage.ts` | MelBand-RoFormer: split vocals + instrumental |
| 3 | `extract_f0` | `extract-f0.stage.ts` | RMVPE: extract F0 pitch contour → f0.npy |
| 4 | `auto_calibrate` | `auto-calibrate.stage.ts` | Analyze source + voice profile → predict RVC params |
| 5 | `convert_vocals` | `convert-vocals.stage.ts` | RVC: timbre conversion with full parameter passthrough |
| 6 | `postprocess_vocals` | `postprocess-vocals.stage.ts` | Python DSP: noise gate, HF augment, de-essing |
| 7 | `remix` | `remix.stage.ts` | FFmpeg: sidechain compress + amix + loudnorm |
| 8 | `quality_gate` | `evaluate.stage.ts` | Validation gate: singer similarity, F0 corr, tearing |
| 9 | `finalize` | `finalize.stage.ts` | Write manifest.json, compute checksums |

## Stage Details

### 1. Source Preparation

- **Input**: Any audio/video format supported by FFmpeg
- **Output**: `01_prep/source.wav` (44.1kHz, 16-bit, mono PCM)
- **Process**: FFmpeg transcodes to standard pipeline format

### 2. Vocal Separation

- **Input**: `01_prep/source.wav`
- **Output**: `02_separate/vocals.wav`, `02_separate/instrumental.wav`
- **Backend**: MelBand-RoFormer (default) or BS-RoFormer
- **Process**: Neural network separates vocal stem from accompaniment

### 3. Pitch Extraction

- **Input**: `02_separate/vocals.wav`
- **Output**: `03_pitch/f0.npy`
- **Backend**: RMVPE
- **Process**: Extract fundamental frequency curve, saved as numpy array

### 4. Auto-Calibrate

- **Input**: `02_separate/vocals.wav` + `voice_profile.json`
- **Output**: Updated converter params in pipeline context
- **Process**:
  1. Extract source features (F0 distribution, speaker embedding, sibilance, dynamic range)
  2. Load target voice profile (embedding centroid, F0 range)
  3. Predict optimal parameters: pitch_shift, index_rate, filter_radius, protect, rms_mix_rate
  4. Overwrite converter params in context
- **Skip condition**: `autoCalibrate === false` or no voice profile found

### 5. Voice Conversion

- **Input**: `02_separate/vocals.wav`, `03_pitch/f0.npy`
- **Output**: `04_convert/converted_vocals.wav`
- **Backend**: RVC (primary) or Seed-VC (zero-shot)
- **Process**:
  1. **Sample rate pre-alignment**: Resample input from 44.1kHz → 40kHz (model native SR) using librosa Kaiser-best resampling
  2. Load model + FAISS index via `load_model(model_path, index_path=...)`
  3. Set params: `f0method`, `f0up_key`, `index_rate`, `filter_radius`, `rms_mix_rate`, `protect`
  4. If F0 file exists: call `vc_single()` directly with `f0_file` parameter
  5. Otherwise: call `infer_file()` (internal F0 extraction)
  6. **Post-alignment**: Resample output from 40kHz → 44.1kHz

### 6. Post-processing

- **Input**: `04_convert/converted_vocals.wav`, `02_separate/vocals.wav` (HF reference)
- **Output**: `04_convert/converted_vocals.wav` (overwritten in-place)
- **Backend**: Python `vocal_postprocess.py`
- **Process** (sequential DSP chain):
  1. **Noise Gate**: Smooth envelope follower, -40dB threshold, 5ms attack, 50ms release. Attenuates low-level noise in silent segments.
  2. **High-frequency Augmentation**: STFT-domain blending of 6-16kHz content from source vocals into converted output. Mix ratio 0.35. Preserves converted phase for temporal coherence. (SYKI-SVC ICASSP 2025 inspired)
  3. **De-essing**: Dynamic compression on 2-8kHz sibilant band. Threshold -20dB, ratio 4:1. Frame-by-frame STFT processing.
  4. **Anti-clipping**: Peak normalization to 0.99 if needed.

### 7. Remix & Mix

- **Input**: `04_convert/converted_vocals.wav`, `02_separate/instrumental.wav`
- **Output**: `05_mix/final_cover.wav`
- **Process**: FFmpeg filter graph:
  1. `aformat`: Normalize both streams to fltp/44.1kHz/stereo
  2. `asplit`: Duplicate vocal for sidechain input and amix input
  3. `volume=${instGainDb}dB`: Reduce instrumental volume (configurable via MixParams, default -8dB)
  4. `sidechaincompress`: Duck instrumental under vocals
  5. `amix`: Combine vocals + ducked instrumental
  6. `loudnorm`: ITU-R BS.1770 loudness normalization (I=-14, LRA=11, TP=-1.5)

### 8. Quality Gate

- **Input**: `04_convert/converted_vocals.wav`, `02_separate/vocals.wav`, voice profile
- **Output**: GateResult (pass/fail + per-metric scores)
- **Checks**:
  - Singer similarity ≥ 0.65
  - F0 correlation ≥ 0.85
  - Source leakage ≤ 0.40
  - Tearing risk ≤ 0.50
- **On failure**: Triggers parameter adjustment and retry (up to 3 attempts)

### 9. Finalize

- **Input**: All stage artifacts
- **Output**: `manifest.json`
- **Process**: Write full audit trail including timing, params, checksums

## Artifact Layout

```
<jobDir>/
  01_prep/
    source.wav                 # Transcoded source audio
  02_separate/
    vocals.wav                 # Isolated vocal stem
    instrumental.wav           # Accompaniment stem
  03_pitch/
    f0.npy                     # F0 pitch contour (numpy)
  04_convert/
    converted_vocals.wav       # Voice-converted + post-processed vocals
  05_mix/
    final_cover.wav            # Final mixed output
  manifest.json                # Full audit trail
```

## Guards

- **InputGuard** (`input-guard.ts`): Validates request schema (mode, backends, voiceId) and checks that `inputUri` file exists on disk before pipeline starts
- **Artifact checks**: `convert-vocals.stage.ts` and `remix.stage.ts` verify required upstream artifacts (vocals, instrumental, converted vocals) exist before processing, returning `success: false` if missing
- **QualityGate** (`evaluate.stage.ts`): Post-inference quality validation with automatic retry
