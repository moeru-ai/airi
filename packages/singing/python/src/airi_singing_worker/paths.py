"""
Standard artifact path conventions.

Mirrors the layout defined in the TS contracts (artifact-layout.ts):
  <job_dir>/
    01_prep/source.wav
    02_separate/vocals.wav, instrumental.wav
    03_pitch/f0.npy
    04_convert/converted_vocals.wav
    05_mix/final_cover.wav
    manifest.json
"""

from pathlib import Path

STAGE_DIRS = {
    "prep": "01_prep",
    "separate": "02_separate",
    "pitch": "03_pitch",
    "convert": "04_convert",
    "mix": "05_mix",
}

ARTIFACT_NAMES = {
    "source": "source.wav",
    "vocals": "vocals.wav",
    "instrumental": "instrumental.wav",
    "f0": "f0.npy",
    "converted_vocals": "converted_vocals.wav",
    "final_cover": "final_cover.wav",
    "manifest": "manifest.json",
}


def build_artifact_path(job_dir: str | Path, stage: str, filename: str) -> Path:
    """Build an artifact path: <job_dir>/<stage_dir>/<filename>."""
    stage_dir = STAGE_DIRS.get(stage, stage)
    return Path(job_dir) / stage_dir / filename
