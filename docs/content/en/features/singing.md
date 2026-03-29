# AI Cover (Singing Voice Conversion)

AIRI's singing module enables converting any song into a specified character's voice.

## Features

- **Character covers**: Convert songs using pre-trained RVC voice models
- **Zero-shot covers**: Upload a reference audio to clone a voice without training (Seed-VC)
- **Automated pipeline**: Vocal separation → pitch extraction → voice conversion → remixing
- **Artifact tracking**: Every job produces a full manifest.json audit trail

## Tech Stack

| Stage | Technology |
|-------|-----------|
| Vocal Separation | MelBand-RoFormer / BS-RoFormer |
| Pitch Extraction | RMVPE |
| Voice Conversion | RVC (primary) / Seed-VC (zero-shot) |
| Post-processing | FFmpeg |

## Documentation

See `packages/singing/docs/` for detailed architecture and API design.
