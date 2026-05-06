"""MelBand-RoFormer separation backend.

Uses the melband-roformer-infer pip package (PyPI: melband-roformer-infer).
The import name is ``mel_band_roformer`` (NOT melband_roformer_infer).

Requires MELBAND_CKPT_PATH and MELBAND_CONFIG_PATH env vars pointing
to the local checkpoint and config files.
"""

import json
import os
from pathlib import Path

from ...compat import patch_torch_load
from ...errors.backend import SeparationError
from ...io.files import ensure_dir
from .mask_refine import reconstruct_stems_from_estimate

patch_torch_load()


def _separate_python_api(input_path: str, output_dir: str) -> dict:
    """Separate using mel_band_roformer Python API with local checkpoint.

    Uses the official ``demix_track`` helper which performs proper overlap-add
    chunk inference.
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

    # The ZFTurbo config uses !!python/tuple which yaml.safe_load rejects.
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
    if "num_overlap" not in inf:
        inf["num_overlap"] = 4
        print(f"inference.num_overlap defaulted to {inf['num_overlap']}", flush=True)
    elif inf["num_overlap"] < 4:
        inf["num_overlap"] = 4
        print(f"inference.num_overlap raised to {inf['num_overlap']} for smoother overlap-add", flush=True)

    config = ConfigDict(raw_cfg)

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

    print(f"Loading audio: {input_path}", flush=True)
    mix, sr = sf.read(input_path)
    original_mono = len(mix.shape) == 1
    if original_mono:
        mix = np.stack([mix, mix], axis=-1)

    mixture = torch.tensor(mix.T, dtype=torch.float32)

    print(f"Running separation (shape={mixture.shape})...", flush=True)
    res, _ = demix_track(config, model, mixture, device)

    instruments = config.training.instruments
    if config.training.target_instrument is not None:
        instruments = [config.training.target_instrument]

    vocal_key = instruments[0]
    vocals_output = res[vocal_key].T
    vocals_output, instrumental = reconstruct_stems_from_estimate(
        mix,
        vocals_output,
        sr,
        alpha=1.0,
        min_mask=0.02,
        max_mask=0.985,
    )
    if original_mono:
        vocals_output = vocals_output[:, 0]
        instrumental = instrumental[:, 0]

    sf.write(vocals_path, vocals_output, sr, subtype="FLOAT")
    sf.write(instrumental_path, instrumental, sr, subtype="FLOAT")

    print("Separation completed via Python API", flush=True)
    return {"vocals": vocals_path, "instrumental": instrumental_path}


def separate(input_path: str, output_dir: str, model: str = "melband-roformer-kim-vocals") -> dict:
    """Run MelBand-RoFormer vocal separation.

    Returns dict with ``vocals`` and ``instrumental`` output paths.
    """
    ensure_dir(output_dir)
    return _separate_python_api(input_path, output_dir)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--model", default="melband-roformer-kim-vocals")
    args = parser.parse_args()
    result = separate(args.input, args.output_dir, args.model)
    print(json.dumps(result))
