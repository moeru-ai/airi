"""FFmpeg-based audio mixing and post-processing."""

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


def _remix_python(vp: str, ip: str, out: str, vocal_gain_db: float, inst_gain_db: float) -> str:
    """Pure-Python fallback mix using soundfile + numpy (no FFmpeg)."""
    import numpy as np
    import soundfile as sf

    vocals, v_sr = sf.read(vp)
    inst, i_sr = sf.read(ip)

    if v_sr != i_sr:
        import librosa
        inst = librosa.resample(inst.T if inst.ndim > 1 else inst, orig_sr=i_sr, target_sr=v_sr)
        if inst.ndim > 1:
            inst = inst.T
        i_sr = v_sr

    if vocals.ndim == 1:
        vocals = vocals[:, None]
    if inst.ndim == 1:
        inst = inst[:, None]

    max_len = max(len(vocals), len(inst))
    if len(vocals) < max_len:
        vocals = np.pad(vocals, ((0, max_len - len(vocals)), (0, 0)))
    if len(inst) < max_len:
        inst = np.pad(inst, ((0, max_len - len(inst)), (0, 0)))

    v_gain = 10 ** (vocal_gain_db / 20.0)
    i_gain = 10 ** (inst_gain_db / 20.0)
    mixed = vocals * v_gain + inst * i_gain

    peak = np.abs(mixed).max()
    if peak > 0.99:
        mixed = mixed * (0.99 / peak)

    sf.write(out, mixed, v_sr, subtype="FLOAT")
    print("Remix completed via Python fallback (no FFmpeg)", flush=True)
    return out


def remix(
    vocals_path: str = "",
    instrumental_path: str = "",
    output_path: str = "",
    vocal_gain_db: float = 0.0,
    inst_gain_db: float = -1.5,
    ducking: bool = True,
    target_lufs: float = -14.0,
    true_peak_db: float = -1.5,
    **kwargs: object,
) -> str:
    """
    Mix converted vocals with instrumental using FFmpeg.
    Falls back to a pure-Python mix if FFmpeg is unavailable.
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
        print("FFmpeg not found, using Python fallback for mixing", flush=True)
        return _remix_python(vp, ip, out, vocal_gain_db, inst_gain_db)

    tp = true_peak_db
    loudnorm = f"loudnorm=I={target_lufs}:LRA=11:TP={tp}"

    # [0] = vocals (lead), [1] = instrumental — duck instrumental under vocals when requested.
    pre = (
        f"[0:a]volume={vocal_gain_db}dB[v0];"
        f"[1:a]volume={inst_gain_db}dB[v1];"
    )
    if ducking:
        filter_complex = (
            f"{pre}"
            f"[v1][v0]sidechaincompress=threshold=0.02:ratio=6:attack=20:release=250[ducked];"
            f"[v0][ducked]amix=inputs=2:weights=1 0.4:duration=longest[mix];"
            f"[mix]{loudnorm}"
        )
    else:
        filter_complex = (
            f"{pre}"
            f"[v0][v1]amix=inputs=2:duration=longest[mix];"
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
