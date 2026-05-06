# Artifact Contracts

## Pipeline Job Artifacts

### Standard Files

| Name | Path | Description |
|------|------|-------------|
| source.wav | `01_prep/` | Normalized source audio (44.1kHz, 16-bit, mono) |
| vocals.wav | `02_separate/` | Isolated vocal stem |
| instrumental.wav | `02_separate/` | Accompaniment stem |
| f0.npy | `03_pitch/` | Pitch contour (numpy float32 array) |
| converted_vocals.wav | `04_convert/` | Voice-converted + post-processed vocals |
| final_cover.wav | `05_mix/` | Final mixed output |
| manifest.json | (root) | Full audit trail |

### Job Directory Layout

```
<jobDir>/
  01_prep/
    source.wav                  # Transcoded source audio
  02_separate/
    vocals.wav                  # Isolated vocal stem
    instrumental.wav            # Accompaniment stem
  03_pitch/
    f0.npy                      # F0 pitch contour
  04_convert/
    converted_vocals.wav        # Voice-converted + post-processed vocals
  05_mix/
    final_cover.wav             # Final mixed output
  manifest.json                 # Full audit trail
```

## Voice Model Storage

All trained voice models are stored under `models/voice_models/` with one
subdirectory per voice ID. Re-training the same voice ID overwrites all files.

### Voice Model Directory

```
models/voice_models/
  └── {voiceId}/
      ├── {voiceId}.pth               # RVC inference weights
      ├── {voiceId}.index             # FAISS retrieval index
      ├── voice_profile.json          # Speaker characteristics
      ├── validation_report.json      # 4-axis evaluation ReportCard
      └── meta.json                   # Training metadata
```

### voice_profile.json

```jsonc
{
  "voice_id": "saki_voice",
  "embedding_centroid": [0.12, -0.34],
  "f0_p10": 165.2,
  "f0_p50": 285.7,
  "f0_p90": 520.3,
  "energy_mean": -18.5,
  "energy_std": 6.2,
  "dynamic_range_db": 35.0,
  "unvoiced_ratio": 0.15,
  "spectral_centroid": 2100.0,
  "spectral_flatness": 0.08
}
```

### validation_report.json

```json
{
  "voice_id": "saki_voice",
  "singer_similarity": 0.99,
  "content_score": 0.50,
  "f0_corr": 0.81,
  "f0_rmse_cents": 45.2,
  "st_accuracy": 0.85,
  "vuv_error": 0.12,
  "mcd": 5.8,
  "loudness_rmse": 2.1,
  "naturalness_mos": 3.4,
  "tearing_score": 0.15,
  "hnr": 18.5,
  "per_bucket_scores": {},
  "worst_samples": [],
  "overall_grade": "B"
}
```

### meta.json

```json
{
  "voice_id": "saki_voice",
  "created_at": "2026-03-28T15:30:00Z",
  "dataset_files": ["saki.wav"],
  "total_duration_sec": 196.46,
  "epochs": 200,
  "batch_size": 32,
  "best_epoch": 125,
  "best_mel_loss": 0.042,
  "final_loss_g": 42.5,
  "final_loss_d": 2.8
}
```

## Model Weight Storage

```
models/
  ├── rmvpe.pt                              # RMVPE pitch extraction (auto-downloaded)
  ├── hubert_base.pt                        # HuBERT content encoder (auto-downloaded)
  ├── separation/
  │   ├── MelBandRoformer.ckpt              # Vocal separation (auto-downloaded)
  │   └── config_vocals_mel_band_roformer_kj.yaml
  ├── pretrained_v2/
  │   ├── f0G40k.pth                        # RVC pretrained generator
  │   └── f0D40k.pth                        # RVC pretrained discriminator
  └── voice_models/
      └── (per-voice directories as above)
```

## manifest.json Schema

See `src/types/manifest.ts` for the full TypeScript interface.

Key fields:

- `version`: Schema version (currently 1)
- `separator.backend`, `separator.model`: Which separator was used
- `converter.backend`, `converter.model`, `converter.params`: Conversion config
- `converter.params.filterRadius`: F0 median filter radius
- `converter.params.protect`: Consonant protection level
- `timing`: Per-stage duration in milliseconds
- `artifactHashes`: SHA-256 checksums for each produced artifact file
- `evaluation`: Quality gate results (singer similarity, F0 correlation, source leakage, tearing risk, pass/fail status, parameter snapshot)
