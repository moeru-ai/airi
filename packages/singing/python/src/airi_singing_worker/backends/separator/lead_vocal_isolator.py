"""Lead vocal isolation backend (Two-Pass separation, Pass 2).

Reuses the mel_band_roformer architecture with a Karaoke-trained checkpoint
to split mixed vocals into lead_vocals + backing_vocals.

Requires KARAOKE_CKPT_PATH and KARAOKE_CONFIG_PATH env vars pointing
to the local Karaoke model checkpoint and config files.
"""

import json
import os
from pathlib import Path

from ...compat import patch_torch_load
from ...errors.backend import SeparationError
from ...io.files import ensure_dir
from .mask_refine import reconstruct_stems_from_estimate, stabilize_lead_presence

patch_torch_load()


def _isolate_python_api(input_path: str, output_dir: str) -> dict:
    """Isolate lead vocals from mixed vocals using MelBand-RoFormer Karaoke model.

    The Karaoke model is trained to separate lead vocals from backing vocals.
    ``instruments[0]`` is extracted as the lead vocal; the residual (input - lead)
    becomes the backing vocal track.
    """
    ckpt = os.environ.get("KARAOKE_CKPT_PATH", "")
    config_path = os.environ.get("KARAOKE_CONFIG_PATH", "")

    if not ckpt or not config_path:
        raise SeparationError(
            f"Karaoke model paths not configured. "
            f"KARAOKE_CKPT_PATH={ckpt!r}, KARAOKE_CONFIG_PATH={config_path!r}. "
            f"Run: pnpm -F @proj-airi/singing download-models"
        )
    if not Path(ckpt).exists():
        raise SeparationError(
            f"Karaoke checkpoint not found: {ckpt}. "
            f"Run: pnpm -F @proj-airi/singing download-models"
        )
    if not Path(config_path).exists():
        raise SeparationError(
            f"Karaoke config not found: {config_path}. "
            f"Run: pnpm -F @proj-airi/singing download-models"
        )

    import numpy as np
    import torch
    import yaml
    import soundfile as sf
    from ml_collections import ConfigDict
    from mel_band_roformer import get_model_from_config, demix_track

    lead_path = str(Path(output_dir) / "lead_vocals.wav")
    backing_path = str(Path(output_dir) / "backing_vocals.wav")

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

    print(f"Loading Karaoke checkpoint: {ckpt}", flush=True)
    state = torch.load(ckpt, map_location="cpu", weights_only=False)
    if isinstance(state, dict) and "state_dict" in state:
        state = state["state_dict"]
    model.load_state_dict(state)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}", flush=True)
    model = model.to(device)
    model.eval()

    print(f"Loading mixed vocals: {input_path}", flush=True)
    mix, sr = sf.read(input_path)
    original_mono = len(mix.shape) == 1
    if original_mono:
        mix = np.stack([mix, mix], axis=-1)

    mixture = torch.tensor(mix.T, dtype=torch.float32)

    print(f"Running lead vocal isolation (shape={mixture.shape})...", flush=True)
    res, _ = demix_track(config, model, mixture, device)

    instruments = config.training.instruments
    if config.training.target_instrument is not None:
        instruments = [config.training.target_instrument]

    lead_key = instruments[0]
    lead_output = res[lead_key].T
    lead_output, backing_output = reconstruct_stems_from_estimate(
        mix,
        lead_output,
        sr,
        alpha=1.0,
        min_mask=0.06,
        max_mask=0.97,
    )
    lead_output = stabilize_lead_presence(
        lead_output,
        mix,
        sr,
        min_presence_ratio=0.40,
        max_mix_blend=0.60,
    )
    backing_output = mix - lead_output
    if original_mono:
        lead_output = lead_output[:, 0]
        backing_output = backing_output[:, 0]

    sf.write(lead_path, lead_output, sr, subtype="FLOAT")
    sf.write(backing_path, backing_output, sr, subtype="FLOAT")

    print("Lead vocal isolation completed via Python API", flush=True)
    return {"lead_vocals": lead_path, "backing_vocals": backing_path}


def isolate(input_path: str, output_dir: str) -> dict:
    """Run lead vocal isolation on mixed vocals.

    Returns dict with ``lead_vocals`` and ``backing_vocals`` output paths.
    """
    ensure_dir(output_dir)
    return _isolate_python_api(input_path, output_dir)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Isolate lead vocals from mixed vocals using Karaoke model"
    )
    parser.add_argument("--input", required=True, help="Path to mixed vocals WAV")
    parser.add_argument("--output-dir", required=True, help="Directory for output files")
    args = parser.parse_args()
    result = isolate(args.input, args.output_dir)
    print(json.dumps(result))
