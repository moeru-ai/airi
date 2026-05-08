"""RMVPE pitch extraction backend.

Uses rvc_python.lib.rmvpe.RMVPE exclusively to ensure training/inference
F0 consistency. The same model and code path that produced F0 during
training is used here for inference.
"""

import json
import os
from pathlib import Path

import numpy as np

from ...errors.backend import PitchExtractionError
from ...io.audio import load_audio
from ...io.files import ensure_dir


def _find_rmvpe_model() -> str | None:
    """Search for the rmvpe.pt model file.

    Priority:
      1. RMVPE_MODEL_PATH env var (set by the TypeScript adapter)
      2. Common relative paths
    """
    env_path = os.environ.get("RMVPE_MODEL_PATH", "")
    if env_path and Path(env_path).exists():
        return env_path

    candidates = [
        Path("models/rmvpe.pt"),
        Path(__file__).resolve().parents[5] / "models" / "rmvpe.pt",
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    return None


def _get_device() -> str:
    """Select inference device for RMVPE."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
    except ImportError:
        pass
    return "cpu"


def extract_f0(input_path: str, output_dir: str) -> str:
    """Extract F0 pitch contour using RMVPE (matching training pipeline).

    RMVPE internally uses hop_length=160 at 16kHz, producing F0 at 100fps.
    This matches the spectrogram frame rate (40kHz / hop=400 = 100fps).

    Returns path to the output f0.npy file.
    """
    ensure_dir(output_dir)
    f0_path = str(Path(output_dir) / "f0.npy")

    rmvpe_path = _find_rmvpe_model()
    if not rmvpe_path:
        raise PitchExtractionError(
            "RMVPE model not found. Set RMVPE_MODEL_PATH env var "
            "or place rmvpe.pt in models/. "
            "Install rvc-python: pip install rvc-python"
        )

    try:
        from rvc_python.lib.rmvpe import RMVPE
    except ImportError as e:
        raise PitchExtractionError(
            "rvc_python.lib.rmvpe is required for F0 extraction. "
            "Install with: pip install rvc-python"
        ) from e

    device = _get_device()
    is_half = device != "cpu"

    rmvpe_model = RMVPE(rmvpe_path, is_half=is_half, device=device)

    waveform, _sr = load_audio(input_path, sr=16000)
    audio = np.asarray(waveform, dtype=np.float32)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=0 if audio.shape[0] < audio.shape[1] else 1)

    f0 = rmvpe_model.infer_from_audio(audio, thred=0.03)
    np.save(f0_path, f0.astype(np.float32))

    del rmvpe_model
    return f0_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    result = extract_f0(args.input, args.output_dir)
    print(json.dumps({"f0_path": result}))
