"""BS-RoFormer separation backend (openmirlab/bs-roformer-infer)."""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path

from ...errors.backend import SeparationError
from ...io.files import ensure_dir


def _ensure_bs_infer_installed() -> None:
    if importlib.util.find_spec("bs_roformer_infer") is None:
        raise SeparationError(
            "bs-roformer-infer is not installed. "
            "Install it with: pip install bs-roformer-infer"
        )


def separate(input_path: str, output_dir: str, model: str = "BS-RoFormer-SW") -> dict:
    """
    Run BS-RoFormer separation (supports multi-stem / 6-stem mode).

    Returns dict with 'vocals', 'instrumental', and optional extra stems.
    """
    _ensure_bs_infer_installed()
    ensure_dir(output_dir)
    vocals_path = str(Path(output_dir) / "vocals.wav")
    instrumental_path = str(Path(output_dir) / "instrumental.wav")

    try:
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "bs_roformer_infer",
                "--input",
                input_path,
                "--output-dir",
                output_dir,
                "--model",
                model,
            ],
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )

        if result.returncode != 0:
            raise SeparationError(
                f"BS-RoFormer failed (exit {result.returncode}): {(result.stderr or '')[:500]}"
            )

        return {"vocals": vocals_path, "instrumental": instrumental_path}

    except FileNotFoundError as e:
        raise SeparationError(
            "Could not run bs-roformer-infer (Python executable missing). "
            "Install bs-roformer-infer with: pip install bs-roformer-infer"
        ) from e


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model", default="BS-RoFormer-SW")
    args = parser.parse_args()
    result = separate(args.input, args.output_dir, args.model)
    print(json.dumps(result))
