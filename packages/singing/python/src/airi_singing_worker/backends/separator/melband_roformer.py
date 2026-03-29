"""MelBand-RoFormer separation backend.

Uses the melband-roformer-infer pip package (PyPI: melband-roformer-infer).
The import name is ``mel_band_roformer`` (NOT melband_roformer_infer).

Strategies (ordered by preference):
  1. Python API — ``mel_band_roformer.demix_track`` with local checkpoint
     pointed to by MELBAND_CKPT_PATH + MELBAND_CONFIG_PATH env vars.
  2. CLI fallback — invokes ``melband-roformer-infer`` executable.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import traceback
from pathlib import Path

from ...compat import patch_torch_load
from ...errors.backend import SeparationError
from ...io.files import ensure_dir

patch_torch_load()


def _separate_python_api(input_path: str, output_dir: str) -> dict:
    """Separate using mel_band_roformer Python API with local checkpoint.

    Uses the official ``demix_track`` helper which performs proper overlap-add
    chunk inference — NOT a raw ``model(tensor)`` call.
    """
    ckpt = os.environ.get("MELBAND_CKPT_PATH", "")
    config_path = os.environ.get("MELBAND_CONFIG_PATH", "")

    if not ckpt or not config_path:
        raise SeparationError(
            f"Model paths not configured. "
            f"MELBAND_CKPT_PATH={ckpt!r}, MELBAND_CONFIG_PATH={config_path!r}"
        )
    if not Path(ckpt).exists():
        raise SeparationError(f"Checkpoint file not found: {ckpt}")
    if not Path(config_path).exists():
        raise SeparationError(f"Config file not found: {config_path}")

    import numpy as np
    import torch
    import yaml
    import soundfile as sf
    from ml_collections import ConfigDict
    from mel_band_roformer import get_model_from_config, demix_track

    vocals_path = str(Path(output_dir) / "vocals.wav")
    instrumental_path = str(Path(output_dir) / "instrumental.wav")

    # ── Load config ──────────────────────────────────────────────────────────
    # The ZFTurbo config uses !!python/tuple which yaml.safe_load rejects.
    # Register a handler so we can still use SafeLoader for everything else.
    loader = yaml.SafeLoader
    if not any(
        r.tag == "tag:yaml.org,2002:python/tuple"
        for r in getattr(loader, "yaml_implicit_resolvers", {}).get(None, [])
    ):
        loader = type("_TupleSafeLoader", (yaml.SafeLoader,), {})
        loader.add_constructor(
            "tag:yaml.org,2002:python/tuple",
            lambda l, node: tuple(l.construct_sequence(node)),
        )

    with open(config_path) as f:
        raw_cfg = yaml.load(f, Loader=loader)  # noqa: S506

    # The ZFTurbo training config omits inference.chunk_size — fill it in
    # from audio.chunk_size so that demix_track doesn't raise AttributeError.
    inf = raw_cfg.setdefault("inference", {})
    if "chunk_size" not in inf:
        inf["chunk_size"] = raw_cfg.get("audio", {}).get("chunk_size", 352800)
        print(f"inference.chunk_size defaulted to {inf['chunk_size']}", flush=True)

    config = ConfigDict(raw_cfg)

    # ── Build model ──────────────────────────────────────────────────────────
    model = get_model_from_config("mel_band_roformer", config)

    print(f"Loading checkpoint: {ckpt}", flush=True)
    state = torch.load(ckpt, map_location="cpu", weights_only=False)
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    model.load_state_dict(state)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}", flush=True)
    model = model.to(device)
    model.eval()

    # ── Read audio (same approach as official inference.py) ───────────────────
    print(f"Loading audio: {input_path}", flush=True)
    mix, sr = sf.read(input_path)
    original_mono = len(mix.shape) == 1
    if original_mono:
        mix = np.stack([mix, mix], axis=-1)

    mixture = torch.tensor(mix.T, dtype=torch.float32)

    # ── Run separation via official overlap-add helper ────────────────────────
    print(f"Running separation (shape={mixture.shape})...", flush=True)
    res, _ = demix_track(config, model, mixture, device)

    # Determine which key holds the vocal stem
    instruments = config.training.instruments
    if config.training.target_instrument is not None:
        instruments = [config.training.target_instrument]

    vocal_key = instruments[0]
    vocals_output = res[vocal_key].T          # (samples, channels)
    if original_mono:
        vocals_output = vocals_output[:, 0]   # (samples,)

    instrumental = mix - vocals_output

    sf.write(vocals_path, vocals_output, sr, subtype="FLOAT")
    sf.write(instrumental_path, instrumental, sr, subtype="FLOAT")

    print("Separation completed via Python API", flush=True)
    return {"vocals": vocals_path, "instrumental": instrumental_path}


def _sanitize_config_for_cli(config_path: str) -> str:
    """Write a copy of the config with !!python/tuple stripped so that the
    upstream CLI (which uses yaml.safe_load) can parse it.  Returns the path
    to the cleaned temp file."""
    import yaml

    loader = type("_TupleSafeLoader", (yaml.SafeLoader,), {})
    loader.add_constructor(
        "tag:yaml.org,2002:python/tuple",
        lambda l, node: tuple(l.construct_sequence(node)),
    )

    with open(config_path) as f:
        cfg = yaml.load(f, Loader=loader)  # noqa: S506

    inf = cfg.setdefault("inference", {})
    if "chunk_size" not in inf:
        inf["chunk_size"] = cfg.get("audio", {}).get("chunk_size", 352800)

    fd, tmp = tempfile.mkstemp(suffix=".yaml", prefix="melband_cfg_")
    os.close(fd)
    with open(tmp, "w") as f:
        yaml.safe_dump(cfg, f, default_flow_style=False)
    return tmp


def _separate_cli(input_path: str, output_dir: str) -> dict:
    """Separate using the ``melband-roformer-infer`` CLI."""
    ckpt = os.environ.get("MELBAND_CKPT_PATH", "")
    config_path = os.environ.get("MELBAND_CONFIG_PATH", "")

    if not ckpt or not config_path or not Path(ckpt).exists() or not Path(config_path).exists():
        raise SeparationError("Model paths not configured or files missing for CLI mode")

    input_file = Path(input_path)
    tmp_input_dir = tempfile.mkdtemp(prefix="melband_in_")
    tmp_output_dir = tempfile.mkdtemp(prefix="melband_out_")
    clean_config = _sanitize_config_for_cli(config_path)

    try:
        shutil.copy2(input_path, os.path.join(tmp_input_dir, input_file.name))

        cmd = [
            sys.executable, "-m", "mel_band_roformer.inference",
            "--config_path", clean_config,
            "--model_path", ckpt,
            "--input_folder", tmp_input_dir,
            "--store_dir", tmp_output_dir,
        ]

        print(f"Running CLI: {' '.join(cmd)}", flush=True)
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600, check=False)

        if result.returncode != 0:
            detail = (result.stderr or result.stdout)[:800]
            raise SeparationError(f"CLI exited {result.returncode}: {detail}")

        # Output files follow the pattern  {stem}_{instrument}.wav
        stem = input_file.stem
        wav_files = list(Path(tmp_output_dir).glob("*.wav"))

        vocals_src = next(
            (f for f in wav_files if "vocal" in f.stem.lower()),
            None,
        )
        inst_src = next(
            (f for f in wav_files if "instrument" in f.stem.lower()),
            None,
        )

        if not vocals_src or not inst_src:
            found = [f.name for f in wav_files]
            raise SeparationError(f"CLI produced no recognizable output. Found: {found}")

        vocals_path = str(Path(output_dir) / "vocals.wav")
        instrumental_path = str(Path(output_dir) / "instrumental.wav")
        shutil.copy2(str(vocals_src), vocals_path)
        shutil.copy2(str(inst_src), instrumental_path)

        print("Separation completed via CLI", flush=True)
        return {"vocals": vocals_path, "instrumental": instrumental_path}

    finally:
        shutil.rmtree(tmp_input_dir, ignore_errors=True)
        shutil.rmtree(tmp_output_dir, ignore_errors=True)
        try:
            os.unlink(clean_config)
        except OSError:
            pass


def separate(input_path: str, output_dir: str, model: str = "melband-roformer-kim-vocals") -> dict:
    """
    Run MelBand-RoFormer vocal separation.

    Returns dict with ``vocals`` and ``instrumental`` output paths.
    """
    ensure_dir(output_dir)

    errors: list[str] = []

    try:
        return _separate_python_api(input_path, output_dir)
    except ImportError as e:
        errors.append(f"[Python API] Import error: {e}")
        print(f"Python API import error: {e}", flush=True)
    except Exception as e:
        errors.append(f"[Python API] {e}")
        print(f"Python API failed:\n{traceback.format_exc()}", flush=True)

    try:
        return _separate_cli(input_path, output_dir)
    except Exception as e:
        errors.append(f"[CLI] {e}")
        print(f"CLI failed:\n{traceback.format_exc()}", flush=True)

    raise SeparationError(
        "All MelBand-RoFormer strategies failed:\n" + "\n---\n".join(errors)
    )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model", default="melband-roformer-kim-vocals")
    args = parser.parse_args()
    result = separate(args.input, args.output_dir, args.model)
    print(json.dumps(result))
