# Model Backends

## Separator

| Backend | Model | Description |
|---------|-------|-------------|
| MelBand-RoFormer | melband-roformer-kim-vocals | Primary vocal separation (recommended) |
| BS-RoFormer | BS-RoFormer-SW (6-stem) | Alternative separator |

## Pitch Extraction

| Backend | Source | Notes |
|---------|--------|-------|
| RMVPE | Dream-High/RMVPE + RVC weights | Recommended by RVC; robust for polyphonic music |

## Voice Conversion

| Backend | Repository | License | Notes |
|---------|-----------|---------|-------|
| RVC | RVC-Project/Retrieval-based-Voice-Conversion | MIT | Primary production backend |
| Seed-VC | Plachtaa/seed-vc | GPL-3.0 | Zero-shot; archived; optional only |

### RVC Inference Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `f0_up_key` | 0 | -12 to 12 | Pitch shift in semitones |
| `f0_method` | rmvpe | rmvpe/crepe/pm | F0 extraction method |
| `index_rate` | 0.75 | 0.10-0.90 | FAISS retrieval influence (higher = more trained timbre) |
| `filter_radius` | 3 | 0-7 | F0 median filter window (higher = smoother pitch) |
| `protect` | 0.20 | 0.10-0.50 | Consonant/breath protection (lower = stronger) |
| `rms_mix_rate` | 0.25 | 0.05-0.80 | Volume envelope mixing (lower = preserve dynamics) |

### RVC Key Features

- **FAISS Index Loading**: `.index` file is passed to `load_model(index_path=...)` for retrieval-augmented conversion
- **Internal RMVPE F0**: RVC uses its own internal RMVPE for F0 extraction, matching the training pipeline exactly
- **Sample Rate Post-alignment**: Output is resampled from model native SR to 44.1kHz after conversion
- **Automatic Format Conversion**: Training checkpoints are auto-converted to inference format on first use

## Post-processing (Python DSP Chain)

| Module | `vocal_postprocess.py` |
|--------|------------------------|
| Backend | Pure NumPy/SciPy DSP (no deep learning) |
| Location | `python/src/airi_singing_worker/backends/postprocessor/` |

### Processing Stages

#### 1. Noise Gate

Suppresses low-level noise in silent segments using smoothed envelope following.

| Parameter | Value | Description |
|-----------|-------|-------------|
| Threshold | -40 dB | RMS level below which signal is attenuated |
| Attack | 5 ms | Gate closing speed |
| Release | 50 ms | Gate opening speed |
| Frame size | 10 ms | Analysis window |

**Algorithm**: RMS-based frame analysis → gain curve → exponential envelope smoothing → apply to signal. The smoothing prevents click artifacts at gate transitions.

#### 2. High-frequency Augmentation (SYKI-SVC Inspired)

Restores high-frequency content lost during voice conversion by blending spectral content from the source vocals.

| Parameter | Value | Description |
|-----------|-------|-------------|
| Low cutoff | 6000 Hz | Start of HF blend region |
| High cutoff | 16000 Hz | End of HF blend region |
| Mix ratio | 0.35 | Source HF contribution (0 = none, 1 = full source HF) |
| FFT size | 2048 | STFT analysis window |
| Hop length | 512 | STFT hop size |

**Algorithm**: STFT both converted and source vocals → in the 6-16kHz band, blend source magnitude into converted magnitude → preserve converted phase for temporal coherence → overlap-add ISTFT.

**Reference**: SYKI-SVC (ICASSP 2025) identified high-frequency restoration as a key technique for reducing electronic artifacts in SVC systems.

#### 3. De-essing

Dynamic compression on sibilant frequencies to reduce harsh "s" and "sh" sounds that are amplified by voice conversion.

| Parameter | Value | Description |
|-----------|-------|-------------|
| Low frequency | 2000 Hz | Start of sibilant band |
| High frequency | 8000 Hz | End of sibilant band |
| Threshold | -20 dB | Compression onset level |
| Ratio | 4:1 | Compression ratio |

**Algorithm**: Per-frame STFT → measure sibilant band RMS → if above threshold, compute gain reduction based on ratio → apply to sibilant bins only → ISTFT.

#### 4. Anti-clipping

Peak normalization to 0.99 if any sample exceeds ±0.99 after the DSP chain.

## Audio I/O

FFmpeg handles all audio I/O operations:
- Source transcoding to pipeline format
- Remix: sidechain compression + amix + loudness normalization
- Output format conversion

### Remix FFmpeg Filter Graph

```
[0:a] → aformat(fltp/44100/stereo) → asplit → [voc1] (sidechain input)
                                              → [voc2] (amix input)
[1:a] → aformat(fltp/44100/stereo) → volume(0.4) → [inst]

[inst][voc1] → sidechaincompress(threshold=0.02, ratio=6, attack=0.01, release=0.5) → [ducked]
[voc2][ducked] → amix(inputs=2, duration=longest, normalize=0)
             → loudnorm(I=-14, LRA=11, TP=-1.5)
             → output
```
