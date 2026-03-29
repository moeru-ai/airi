"""Seed-VC zero-shot singing voice conversion backend (GPL-3.0)."""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

from ...errors.backend import ConversionError
from ...io.files import ensure_dir


def _ensure_seed_vc_installed() -> None:
    if importlib.util.find_spec("seed_vc") is None:
        raise ConversionError(
            "Seed-VC is not installed. Clone and install from: "
            "https://github.com/Plachtaa/seed-vc"
        )


def convert(
    vocals_path: str = "",
    reference_path: str = "",
    output_dir: str = "",
    diffusion_steps: int = 40,
    f0_condition: bool = True,
    auto_f0_adjust: bool = False,
    semi_tone_shift: int = 0,
    checkpoint: str = "seed-uvit-whisper-base",
    **kwargs: object,
) -> str:
    """
    Run Seed-VC zero-shot voice conversion.
    Returns path to converted_vocals.wav.
    """
    _ensure_seed_vc_installed()
    input_path = str(kwargs.get("input", vocals_path) or vocals_path)
    ref = str(kwargs.get("reference", reference_path) or reference_path)
    out = str(kwargs.get("output_dir", output_dir) or output_dir)
    ensure_dir(out)
    output_path = str(Path(out) / "converted_vocals.wav")

    cmd = [
        sys.executable,
        "-m",
        "seed_vc",
        "--source",
        input_path,
        "--target",
        ref,
        "--output",
        output_path,
        "--diffusion-steps",
        str(kwargs.get("diffusion_steps", diffusion_steps)),
        "--checkpoint",
        str(kwargs.get("checkpoint", checkpoint)),
    ]

    if kwargs.get("f0_condition", f0_condition):
        cmd.append("--f0-condition")
    if kwargs.get("auto_f0_adjust", auto_f0_adjust):
        cmd.append("--auto-f0-adjust")
    shift = int(kwargs.get("semi_tone_shift", semi_tone_shift))
    if shift != 0:
        cmd.extend(["--semi-tone-shift", str(shift)])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600, check=False)
    except FileNotFoundError as e:
        raise ConversionError(
            "Seed-VC is not installed. Clone and install from: "
            "https://github.com/Plachtaa/seed-vc"
        ) from e

    if result.returncode != 0:
        raise ConversionError(
            f"Seed-VC conversion failed (exit {result.returncode}): {(result.stderr or '')[:500]}"
        )

    return output_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--reference", default="")
    parser.add_argument("--checkpoint", default="seed-uvit-whisper-base")
    parser.add_argument("--diffusion-steps", type=int, default=40)
    parser.add_argument("--f0-condition", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--auto-f0-adjust", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--semi-tone-shift", type=int, default=0)
    args = parser.parse_args()
    result = convert(
        vocals_path=args.input,
        reference_path=args.reference,
        output_dir=args.output_dir,
        diffusion_steps=args.diffusion_steps,
        f0_condition=args.f0_condition,
        auto_f0_adjust=args.auto_f0_adjust,
        semi_tone_shift=args.semi_tone_shift,
        checkpoint=args.checkpoint,
    )
    print(json.dumps({"output_path": result}))
