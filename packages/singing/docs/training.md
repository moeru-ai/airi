# Voice Model Training

## Overview

The training system performs RVC v2 GAN fine-tuning to create custom voice models
from audio data. It goes beyond vanilla RVC training with advanced optimizations
for stable convergence and high output quality.

## Training Pipeline

```
Input Audio (WAV)
  │
  ├─[1. Validate & Preprocess]
  │    ├─ Resample to 40kHz
  │    ├─ Slice into segments (4s window, 0.3s overlap)
  │    ├─ Normalize amplitude
  │    └─ Split train/holdout (85%/15%)
  │
  ├─[2. Feature Extraction]
  │    ├─ HuBERT content embeddings (768-dim)
  │    ├─ F0 pitch contour (RMVPE)
  │    └─ Speaker ID assignment
  │
  ├─[3. GAN Fine-tuning]
  │    ├─ Generator: SynthesizerTrnMs768NSFsid (from pretrained f0G40k.pth)
  │    ├─ Discriminator: MultiPeriodDiscriminatorV2 (from pretrained f0D40k.pth)
  │    └─ Training loop with advanced optimizations (see below)
  │
  ├─[4. Post-training]
  │    ├─ Select best checkpoint (lowest validation mel loss)
  │    ├─ Convert to inference format
  │    ├─ Build FAISS retrieval index
  │    ├─ Build voice_profile.json
  │    └─ Run 4-axis evaluation → validation_report.json
  │
  └─[5. Output]
       models/voice_models/{voiceId}/
         ├─ {voiceId}.pth
         ├─ {voiceId}.index
         ├─ voice_profile.json
         ├─ validation_report.json
         └─ meta.json
```

## Training Configuration

All hyperparameters are defined in `training/config.py` (`TrainingConfig` dataclass):

### Audio / STFT Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `sampling_rate` | 40000 | Model native sample rate |
| `filter_length` | 2048 | STFT FFT size |
| `hop_length` | 400 | STFT hop size |
| `win_length` | 2048 | STFT window size |
| `n_mel_channels` | 128 | Number of mel bands |

### Training Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `learning_rate` | 1e-4 | AdamW initial learning rate |
| `betas` | (0.8, 0.99) | AdamW beta parameters |
| `batch_size` | 8 | Samples per batch |
| `epochs` | 200 | Maximum training epochs |
| `segment_size` | 12800 | Audio segment length (samples) |

### Advanced Optimizations

| Feature | Parameters | Description |
|---------|-----------|-------------|
| **Warmup + Cosine Annealing** | `warmup_epochs=10`, `lr_min=1e-6` | Linear warmup prevents early instability, cosine decay prevents late overfitting |
| **EMA** | `ema_decay=0.999`, `ema_start_epoch=20` | Exponential Moving Average of generator weights for stable inference |
| **Multi-scale Mel Loss** | 3 scales (512/1024/2048 FFT), `c_ms_mel=15.0` | BigVGAN-v2 style multi-resolution frequency matching |
| **R1 Gradient Penalty** | `r1_gamma=5.0`, `r1_interval=16` | Discriminator regularization to prevent training instability |
| **BFloat16** | `use_bf16=True` | Prefer BFloat16 on Ampere+ GPUs (auto-fallback to FP16) |
| **Gradient Accumulation** | `grad_accum_steps=1` | Increase effective batch size without more GPU memory |
| **Gradient Clipping** | `max_grad_norm_g=10.0`, `max_grad_norm_d=10.0` | Prevent gradient explosion |
| **Early Stopping** | `patience=200`, `min_delta=0.01` | Stop when validation mel loss plateaus |
| **Best Model Selection** | `save_best=True` | Save checkpoint with lowest validation mel loss |
| **GPU Data Caching** | `cache_data_on_gpu=True` | Cache training data on GPU for faster data loading |

### Loss Functions

The total generator loss combines:

```
L_G = L_GAN + c_mel × L_mel + c_kl × L_KL + c_ms_mel × L_multi_scale_mel
```

| Loss | Weight | Description |
|------|--------|-------------|
| `L_GAN` | 1.0 | Adversarial loss (least-squares GAN) |
| `L_mel` | 45.0 | L1 mel spectrogram reconstruction |
| `L_KL` | 1.0 | KL divergence for latent distribution |
| `L_multi_scale_mel` | 15.0 | Multi-resolution mel loss (3 scales) |

The discriminator loss:

```
L_D = L_disc_real + L_disc_fake + (every r1_interval steps) r1_gamma × L_R1
```

### Learning Rate Schedule

```
LR
│
│  ╱‾‾‾╲
│ ╱      ╲
│╱        ‾‾‾‾‾‾‾‾‾‾‾‾──────── lr_min
│
└───┬──────────────────────────── epoch
    warmup     cosine annealing
   (10 ep)     (remaining epochs)
```

## Best Model Selection

The system tracks the best checkpoint by **validation mel loss** (raw mel L1, no KL or GAN):

- Every `val_interval` (default 25) epochs, validation mel loss is computed
- If the new loss is lower than the current best minus `min_delta`, the checkpoint is saved as the best
- At the end of training, the best checkpoint (not the latest) is used for inference
- This prevents using overfit or degraded late-training checkpoints

## Progress Tracking

Training progress is reported via a `progress.json` file written to the output directory:

```json
{
  "type": "progress",
  "epoch": 150,
  "total_epochs": 200,
  "loss_g": 42.5,
  "loss_d": 2.8,
  "mel_raw": 0.045,
  "lr_g": 3.2e-5,
  "best_mel": 0.042,
  "best_epoch": 125
}
```

The TypeScript server polls this file every 2 seconds to update the frontend.

## Recommendations

- **Dataset quality**: Clean, dry vocals preferred. High SNR, no reverb/effects.
- **Duration**: Official minimum is 10 min; 30+ min recommended for singing voice.
- **Content**: Cover diverse pitch ranges, vowels, and singing techniques.
- **Sample rate**: Input is automatically resampled to 40kHz.
- **Epochs**: 200 is a good default; the system will early-stop if loss plateaus.
- **Batch size**: 8-32 depending on GPU memory (32 recommended for ≥16GB VRAM).
- **Re-training**: Re-training the same voice ID overwrites the previous model in `voice_models/{voiceId}/`.

## Inference Format Conversion

Training checkpoints have format `{model, iteration, learning_rate}`. For inference,
`rvc.py` automatically converts them to `{weight, config, info, sr, f0, version}` on first use.
This conversion is idempotent and happens in-place.

## CLI Usage

Training is typically triggered via the HTTP API (`POST /jobs/train`), but the Python
pipeline can also be invoked directly:

```bash
python -m airi_singing_worker.pipelines.training_pipeline \
  --voice-id my_singer \
  --dataset-dir path/to/audio/ \
  --output-dir path/to/output/ \
  --epochs 200 \
  --batch-size 32
```
