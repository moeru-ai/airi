"""FFmpeg-based audio mixing and post-processing.

Requires FFmpeg to be installed and available on PATH or via
AIRI_SINGING_FFMPEG_PATH env var.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path

from ...errors.backend import MixError
from ...io.files import ensure_dir


def _find_ffmpeg() -> str | None:
    """Locate the ffmpeg binary via env var, PATH, or common locations."""
    env = os.environ.get("AIRI_SINGING_FFMPEG_PATH", "")
    if env and (Path(env).exists() or shutil.which(env)):
        return env
    return shutil.which("ffmpeg")


def remix(
    vocals_path: str = "",
    instrumental_path: str = "",
    output_path: str = "",
    vocal_gain_db: float = 0.0,
    inst_gain_db: float = -2.0,
    ducking: bool = True,
    target_lufs: float = -14.0,
    true_peak_db: float = -1.5,
    **kwargs: object,
) -> str:
    """Mix converted vocals with instrumental using FFmpeg.

    Returns path to final_cover.wav.
    """
    vp = str(kwargs.get("input", vocals_path) or vocals_path)
    ip = str(kwargs.get("instrumental", instrumental_path) or instrumental_path)
    out = str(kwargs.get("output", output_path) or output_path)

    if not out:
        out_dir = str(kwargs.get("output_dir", "") or "")
        if out_dir:
            ensure_dir(out_dir)
            out = str(Path(out_dir) / "final_cover.wav")

    ensure_dir(str(Path(out).parent))

    ffmpeg_bin = _find_ffmpeg()
    if ffmpeg_bin is None:
        raise MixError(
            "FFmpeg is required for audio mixing. "
            "Install FFmpeg and ensure it is on PATH, or set "
            "AIRI_SINGING_FFMPEG_PATH env var."
        )

    tp = true_peak_db
    loudnorm = f"loudnorm=I={target_lufs}:LRA=11:TP={tp}"

    pre = (
        f"[0:a]volume={vocal_gain_db}dB[v0];"
        f"[1:a]volume={inst_gain_db}dB[v1];"
    )
    if ducking:
        filter_complex = (
            f"{pre}"
            f"[v1][v0]sidechaincompress=threshold=0.08:ratio=3:attack=15:release=300:knee=4[ducked];"
            f"[v0][ducked]amix=inputs=2:weights=1 1:duration=longest:normalize=0[mix];"
            f"[mix]{loudnorm}"
        )
    else:
        filter_complex = (
            f"{pre}"
            f"[v0][v1]amix=inputs=2:duration=longest:normalize=0[mix];"
            f"[mix]{loudnorm}"
        )

    cmd = [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        vp,
        "-i",
        ip,
        "-filter_complex",
        filter_complex,
        "-ar",
        "44100",
        "-y",
        out,
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300, check=False)
    except FileNotFoundError as e:
        raise MixError("FFmpeg is not installed or not on PATH.") from e

    if result.returncode != 0:
        raise MixError(
            f"FFmpeg remix failed (exit {result.returncode}): {(result.stderr or '')[:500]}"
        )

    return out


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--vocals", required=True)
    parser.add_argument("--instrumental", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--ducking", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--target-lufs", type=float, default=-14.0)
    parser.add_argument("--true-peak-db", type=float, default=-1.5)
    args = parser.parse_args()
    result = remix(
        vocals_path=args.vocals,
        instrumental_path=args.instrumental,
        output_path=args.output,
        ducking=args.ducking,
        target_lufs=args.target_lufs,
        true_peak_db=args.true_peak_db,
    )
    print(json.dumps({"output_path": result}))
