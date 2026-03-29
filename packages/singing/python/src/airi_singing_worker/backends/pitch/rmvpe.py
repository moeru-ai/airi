"""RMVPE pitch extraction backend."""

import json
import os
from pathlib import Path

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
        Path("models/rmvpe.onnx"),
        Path(__file__).resolve().parents[5] / "models" / "rmvpe.pt",
    ]
    for p in candidates:
        if p.exists():
            return str(p)
    return None


def _extract_f0_pyworld(waveform: object, sr: int) -> "object":
    import numpy as np
    import pyworld as pw

    x = np.asarray(waveform, dtype=np.float64)
    if x.ndim > 1:
        x = np.mean(x, axis=0 if x.shape[0] < x.shape[1] else 1)
    x = np.ascontiguousarray(x)
    frame_period = 5.0
    _f0, t = pw.harvest(x, sr, frame_period=frame_period)
    f0 = pw.stonemask(x, _f0, t, sr)
    return f0.astype(np.float32)


def _extract_f0_librosa(waveform: object, sr: int) -> "object":
    import librosa
    import numpy as np

    x = np.asarray(waveform, dtype=np.float32)
    if x.ndim > 1:
        x = np.mean(x, axis=0 if x.shape[0] < x.shape[1] else 1)
    f0, _, _ = librosa.pyin(
        x,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C7"),
        sr=sr,
    )
    return np.nan_to_num(f0, nan=0.0).astype(np.float32)


def _try_torchcrepe_f0(input_path: str, f0_path: str) -> bool:
    """Return True if F0 was written with torchcrepe."""
    try:
        import numpy as np
        import torch
        import torchcrepe
    except ImportError:
        return False

    try:
        waveform, sr = load_audio(input_path, sr=16000)
        if isinstance(waveform, torch.Tensor):
            audio = waveform.float().flatten()
        else:
            w = np.asarray(waveform, dtype=np.float32)
            if w.ndim > 1:
                w = np.mean(w, axis=0 if w.shape[0] < w.shape[1] else 1)
            audio = torch.from_numpy(np.ascontiguousarray(w)).float()
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        audio = audio.to(device)
        hop_length = int(sr / 200.0)
        fmin = 50
        fmax = 550
        pitch = torchcrepe.predict(
            audio,
            sr,
            hop_length,
            fmin,
            fmax,
            "full",
            batch_size=1024,
            device=device,
        )
        f0_np = pitch.detach().cpu().numpy().astype(np.float32).squeeze()
        np.save(f0_path, f0_np)
        return True
    except Exception:
        return False


def extract_f0(input_path: str, output_dir: str) -> str:
    """
    Extract F0 pitch contour: prefer torchcrepe (CREPE), then pyworld harvest, then librosa pyin.

    Returns path to the output f0.npy file.
    """
    ensure_dir(output_dir)
    f0_path = str(Path(output_dir) / "f0.npy")

    try:
        import numpy as np
    except ImportError as e:
        raise PitchExtractionError(
            "numpy is required for RMVPE. Install with: pip install numpy"
        ) from e

    # Pitch extraction strategy (ordered by quality):
    # 1. torchcrepe (CREPE full) — best quality, requires torch + torchcrepe
    # 2. pyworld (harvest+stonemask) — good quality, CPU-only, requires pyworld
    # 3. librosa (pyin) — baseline, requires librosa
    # Future: native RMVPE checkpoint loading when _find_rmvpe_model() finds rmvpe.pt

    if _try_torchcrepe_f0(input_path, f0_path):
        return f0_path

    try:
        import pyworld as pw  # noqa: F401
    except ImportError:
        pw = None  # type: ignore[assignment]
    if pw is not None:
        try:
            waveform, sr = load_audio(input_path, sr=44100)
            f0 = _extract_f0_pyworld(waveform, sr)
            np.save(f0_path, f0)
            return f0_path
        except PitchExtractionError:
            raise
        except Exception as e:
            raise PitchExtractionError(
                "pyworld F0 extraction failed. Install with: pip install pyworld. "
                f"Error: {e!s}"
            ) from e

    try:
        import librosa  # noqa: F401
    except ImportError as e:
        raise PitchExtractionError(
            "No F0 backend available. Install one of: "
            "pip install torch torchcrepe  OR  pip install pyworld  OR  pip install librosa. "
            f"Original import error: {e!s}"
        ) from e

    try:
        waveform, sr = load_audio(input_path, sr=22050)
        f0 = _extract_f0_librosa(waveform, sr)
        np.save(f0_path, f0)
        return f0_path
    except Exception as e:
        raise PitchExtractionError(
            f"librosa F0 (pyin) failed: {e!s}"
        ) from e


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    result = extract_f0(args.input, args.output_dir)
    print(json.dumps({"f0_path": result}))
