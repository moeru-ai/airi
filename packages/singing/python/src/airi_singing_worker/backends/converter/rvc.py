"""RVC (Retrieval-based Voice Conversion) backend.

Uses the rvc_python package (PyPI: rvc-python) for inference.
The import name is rvc_python (underscore), NOT rvc.

Environment variables (set by the TypeScript adapter):
  RMVPE_MODEL_PATH  — path to rmvpe.pt for F0 extraction
  HUBERT_MODEL_PATH — path to hubert_base.pt for content features
"""

import json
import logging
import os
import inspect
import shutil
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from ...compat import patch_torch_load
from ...errors.backend import ConversionError
from ...io.files import ensure_dir

logger = logging.getLogger(__name__)

patch_torch_load()

MODEL_TARGET_SR = 40000
PIPELINE_SR = 44100


def _patched_load_audio(file: str, sr: int) -> np.ndarray:
    """Drop-in replacement for rvc_python.lib.audio.load_audio.

    The bundled load_audio is broken on modern PyAV (av >= 12) because
    ``ostream.channels`` became read-only. We bypass av entirely.
    """
    import subprocess
    from ...io.ffmpeg import _get_ffmpeg_bin

    try:
        out = subprocess.run(
            [_get_ffmpeg_bin(), "-nostdin", "-loglevel", "error",
             "-i", file,
             "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", str(sr), "-"],
            capture_output=True, check=True, timeout=300,
        )
        return np.frombuffer(out.stdout, np.float32).flatten()
    except Exception as e:
        logger.warning("FFmpeg audio load failed, using soundfile: %s", e)
        data, orig_sr = sf.read(file, dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)
        if orig_sr != sr:
            import librosa
            logger.info("Resampling %dHz -> %dHz via librosa", orig_sr, sr)
            data = librosa.resample(data, orig_sr=orig_sr, target_sr=sr)
        return data


def _apply_load_audio_patch() -> None:
    """Monkey-patch rvc_python.lib.audio.load_audio so vc_single works."""
    try:
        import rvc_python.lib.audio as _rvc_audio
        _rvc_audio.load_audio = _patched_load_audio
    except Exception:
        pass

    try:
        import rvc_python.modules.vc.modules as _rvc_vc
        _rvc_vc.load_audio = _patched_load_audio
    except Exception:
        pass

# ── RVC architecture config tables ──
# Each config is the 18 constructor args for the corresponding Synthesizer class.
# Fields: spec_channels, segment_size, inter_channels, hidden_channels,
#   filter_channels, n_heads, n_layers, kernel_size, p_dropout, resblock,
#   resblock_kernel_sizes, resblock_dilation_sizes, upsample_rates,
#   upsample_initial_channel, upsample_kernel_sizes,
#   spk_embed_dim, gin_channels, sr

_RVC_V2_40K_CONFIG = [
    1025, 32, 192, 192, 768, 2, 6, 3, 0, "1",
    [3, 7, 11],
    [[1, 3, 5], [1, 3, 5], [1, 3, 5]],
    [10, 10, 2, 2],
    512, [16, 16, 4, 4],
    109, 256,
    40000,
]

_RVC_V2_32K_CONFIG = [
    513, 32, 192, 192, 768, 2, 6, 3, 0, "1",
    [3, 7, 11],
    [[1, 3, 5], [1, 3, 5], [1, 3, 5]],
    [10, 8, 2, 2],
    512, [16, 16, 4, 4],
    109, 256,
    32000,
]

_RVC_V2_48K_CONFIG = [
    1025, 32, 192, 192, 768, 2, 6, 3, 0, "1",
    [3, 7, 11],
    [[1, 3, 5], [1, 3, 5], [1, 3, 5]],
    [12, 10, 2, 2],
    512, [24, 20, 4, 4],
    109, 256,
    48000,
]

_RVC_V1_40K_CONFIG = [
    1025, 32, 192, 192, 768, 2, 6, 3, 0, "1",
    [3, 7, 11],
    [[1, 3, 5], [1, 3, 5], [1, 3, 5]],
    [10, 10, 2, 2],
    512, [16, 16, 4, 4],
    109, 256,
    40000,
]

# (version, sr_key) -> (config, label)
_CONFIG_TABLE: dict[tuple[str, str], tuple[list, str]] = {
    ("v2", "40k"): (_RVC_V2_40K_CONFIG, "v2-40k-f0"),
    ("v2", "32k"): (_RVC_V2_32K_CONFIG, "v2-32k-f0"),
    ("v2", "48k"): (_RVC_V2_48K_CONFIG, "v2-48k-f0"),
    ("v1", "40k"): (_RVC_V1_40K_CONFIG, "v1-40k-f0"),
}


def _detect_model_arch(
    weights: dict,
    meta: dict,
) -> tuple[str, str, int]:
    """Detect RVC model version, sample rate key, and f0 flag from checkpoint.

    Returns (version, sr_key, f0_flag). Inspects metadata fields first,
    then falls back to weight tensor shapes for version detection.
    """
    version = str(meta.get("version", "")).lower()
    sr_raw = meta.get("sr", "")
    f0_flag = int(meta.get("f0", 1))

    # Infer version from weight shapes when metadata is absent.
    # v2 uses 768-dim HuBERT -> emb_g embedding has shape[0] related to 768-dim features
    # v1 uses 256-dim HuBERT -> enc_p.encoder.attn_layers weights differ in size
    if not version:
        emb_key = "emb_g.weight"
        if emb_key in weights:
            emb_dim = weights[emb_key].shape[0]
            # v2 models use 109 speaker embeddings with 256-dim gin_channels
            # Both v1 and v2 can have the same emb_g shape, so check enc_p input dim
            version = "v2"
            for k, v in weights.items():
                # v1 has 256-channel intermediate, v2 has 768-channel
                if k == "enc_p.encoder.attn_layers.0.conv_k.weight":
                    ch = v.shape[1]
                    version = "v1" if ch <= 256 else "v2"
                    break
        else:
            version = "v2"

    if not sr_raw:
        sr_raw = "40k"

    sr_key = str(sr_raw).replace("000", "k").lower()
    if sr_key not in ("32k", "40k", "48k"):
        # Try numeric parse: 32000->32k, 40000->40k, 48000->48k
        try:
            sr_num = int(sr_raw)
            sr_key = f"{sr_num // 1000}k"
        except (ValueError, TypeError):
            sr_key = "40k"

    return version, sr_key, f0_flag


def _ensure_inference_format(model_path: str) -> str:
    """Convert training checkpoint to RVC inference format if needed.

    rvc_python.infer expects {weight, config, ...} but training checkpoints
    only have {model, iteration, learning_rate}. This function detects the
    model architecture (v1/v2, 32k/40k/48k) from metadata and weight shapes,
    then writes the correct config. Raises ConversionError if the architecture
    cannot be determined.
    """
    import torch

    cpt = torch.load(model_path, map_location="cpu", weights_only=False)
    if not isinstance(cpt, dict):
        return model_path

    if "config" in cpt and "weight" in cpt:
        return model_path

    if "model" not in cpt:
        return model_path

    weights = cpt["model"]
    version, sr_key, f0_flag = _detect_model_arch(weights, cpt)
    config_key = (version, sr_key)

    if config_key not in _CONFIG_TABLE:
        raise ConversionError(
            f"Unsupported RVC architecture: version={version}, sr={sr_key}. "
            f"Supported: {list(_CONFIG_TABLE.keys())}. "
            f"Provide a model in inference format (with 'config' + 'weight' keys)."
        )

    config, label = _CONFIG_TABLE[config_key]
    logger.info(
        "Converting training checkpoint to inference format: %s (detected: %s)",
        model_path, label,
    )

    inference_cpt = {
        "weight": weights,
        "config": config,
        "info": f"{label} (auto-converted from training checkpoint)",
        "sr": sr_key,
        "f0": f0_flag,
        "version": version,
    }
    torch.save(inference_cpt, model_path)
    logger.info("Checkpoint converted successfully: %s", label)
    return model_path


def _find_model(voice_id: str, models_dir: str | None = None) -> str | None:
    """Search standard locations for an RVC .pth model file.

    Priority order:
      1. voice_models/{voice_id}/{voice_id}.pth  (new per-voice subdirectory)
      2. {models_dir}/{voice_id}.pth             (legacy flat layout)
      3. package-root/models/voice_models/{voice_id}/{voice_id}.pth
      4. package-root/models/{voice_id}.pth       (legacy flat layout)
    """
    candidates: list[Path] = []
    if models_dir:
        candidates.append(Path(models_dir) / "voice_models" / voice_id / f"{voice_id}.pth")
        candidates.append(Path(models_dir) / f"{voice_id}.pth")
    pkg_models = Path(__file__).resolve().parents[5] / "models"
    candidates.append(pkg_models / "voice_models" / voice_id / f"{voice_id}.pth")
    candidates.append(pkg_models / f"{voice_id}.pth")
    for c in candidates:
        if c.exists():
            return str(c)
    return None


def _find_index(voice_id: str, models_dir: str | None = None) -> str | None:
    """Search standard locations for an RVC .index file."""
    candidates: list[Path] = []
    if models_dir:
        candidates.append(Path(models_dir) / "voice_models" / voice_id / f"{voice_id}.index")
        candidates.append(Path(models_dir) / f"{voice_id}.index")
    pkg_models = Path(__file__).resolve().parents[5] / "models"
    candidates.append(pkg_models / "voice_models" / voice_id / f"{voice_id}.index")
    candidates.append(pkg_models / f"{voice_id}.index")
    for c in candidates:
        if c.exists():
            return str(c)
    return None


def _link_or_copy(src_path: str, dst_path: str) -> None:
    """Materialize a model artifact under the requested registry layout."""
    try:
        os.link(src_path, dst_path)
    except OSError:
        shutil.copy2(src_path, dst_path)


def _prepare_model_registry(
    model_path: str,
    index_path: str,
    voice_id: str,
) -> tuple[str, str, str | None]:
    """Prepare a models_dir/model_name pair for newer rvc_python APIs.

    Newer `rvc_python` releases load models by registry name rather than by
    direct checkpoint path. Reuse the existing `voice_models/<voiceId>/`
    directory layout when possible; otherwise stage a temporary registry bundle.
    """
    model_file = Path(model_path).resolve()
    model_name = voice_id or model_file.stem

    if (
        model_file.parent.name == model_name
        and model_file.name == f"{model_name}.pth"
    ):
        registry_root = model_file.parent.parent
        return str(registry_root), model_name, None

    staged_root = Path(tempfile.mkdtemp(prefix="airi-rvc-model-"))
    staged_model_dir = staged_root / model_name
    staged_model_dir.mkdir(parents=True, exist_ok=True)

    staged_model_path = staged_model_dir / f"{model_name}.pth"
    _link_or_copy(str(model_file), str(staged_model_path))

    if index_path and Path(index_path).exists():
        staged_index_path = staged_model_dir / f"{model_name}.index"
        _link_or_copy(index_path, str(staged_index_path))

    return str(staged_root), model_name, str(staged_root)


def convert(
    vocals_path: str = "",
    output_dir: str = "",
    model_path: str = "",
    voice_id: str = "",
    models_dir: str | None = None,
    f0_up_key: int = 0,
    f0_method: str = "rmvpe",
    index_file: str | None = None,
    index_rate: float = 0.75,
    filter_radius: int = 3,
    rms_mix_rate: float = 0.25,
    protect: float = 0.33,
    **kwargs: object,
) -> str:
    """
    Run RVC voice conversion using the rvc_python library.
    Returns path to converted_vocals.wav.
    """
    try:
        from rvc_python.infer import RVCInference
    except ImportError:
        raise ConversionError(
            "RVC library is not installed. "
            "Install with: pip install rvc-python"
        )

    _apply_load_audio_patch()

    input_path = str(kwargs.get("input", vocals_path) or vocals_path)
    out = str(kwargs.get("output_dir", output_dir) or output_dir)
    ensure_dir(out)
    output_path = str(Path(out) / "converted_vocals.wav")

    vid = str(kwargs.get("voice_id", voice_id) or voice_id)
    models_directory = str(kwargs.get("models_dir", models_dir or "")) or None
    if not model_path and vid:
        model_path = _find_model(vid, models_directory) or ""

    if not model_path:
        raise ConversionError("No RVC model file found. Provide a model_path or valid voice_id.")

    model_path = _ensure_inference_format(model_path)
    device = _get_inference_device()

    idx_path = str(kwargs.get("index_file", index_file or "")) or ""
    if not idx_path and vid:
        idx_path = _find_index(vid, models_directory) or ""

    actual_index_rate = float(kwargs.get("index_rate", index_rate))
    actual_filter_radius = int(kwargs.get("filter_radius", filter_radius))
    actual_f0_up_key = int(kwargs.get("f0_up_key", f0_up_key))
    actual_rms_mix_rate = float(kwargs.get("rms_mix_rate", rms_mix_rate))
    actual_protect = float(kwargs.get("protect", protect))
    staged_registry_root = None

    try:
        rvc_input = input_path

        def _try_direct_load() -> bool:
            """Attempt the legacy load_model(path, index_path=...) API."""
            try:
                params = inspect.signature(RVCInference.load_model).parameters
                if "index_path" not in params:
                    return False
            except (ValueError, TypeError):
                return False
            return True

        if _try_direct_load():
            try:
                rvc = RVCInference(device=device)
                rvc.load_model(model_path, index_path=idx_path)
                resolved_index_path = idx_path
            except TypeError:
                models_root, model_name, staged_registry_root = _prepare_model_registry(
                    model_path=model_path,
                    index_path=idx_path,
                    voice_id=vid,
                )
                rvc = RVCInference(models_dir=models_root, device=device)
                rvc.load_model(model_name)
                resolved_index_path = str(rvc.models.get(model_name, {}).get("index") or "")
        else:
            models_root, model_name, staged_registry_root = _prepare_model_registry(
                model_path=model_path,
                index_path=idx_path,
                voice_id=vid,
            )
            rvc = RVCInference(models_dir=models_root, device=device)
            rvc.load_model(model_name)
            resolved_index_path = str(rvc.models.get(model_name, {}).get("index") or "")

        rvc.set_params(
            f0method=f0_method,
            f0up_key=actual_f0_up_key,
            index_rate=actual_index_rate,
            filter_radius=actual_filter_radius,
            rms_mix_rate=actual_rms_mix_rate,
            protect=actual_protect,
            resample_sr=0,
        )

        rvc.infer_file(rvc_input, output_path)

        # Post-align: resample output back to pipeline standard (44.1kHz)
        out_info = sf.info(output_path)
        if out_info.samplerate != PIPELINE_SR:
            _resample_wav(output_path, output_path, PIPELINE_SR)
            print(f"Post-aligned: {out_info.samplerate}Hz -> {PIPELINE_SR}Hz", flush=True)
    except Exception as e:
        raise ConversionError(f"RVC conversion failed: {e!s}") from e
    finally:
        if staged_registry_root and os.path.exists(staged_registry_root):
            shutil.rmtree(staged_registry_root, ignore_errors=True)

    return output_path


def _resample_wav(src_path: str, dst_path: str, target_sr: int) -> None:
    """High-quality resampling using librosa (Kaiser best)."""
    import librosa
    data, orig_sr = sf.read(src_path, dtype="float32")
    if data.ndim > 1:
        channels = [librosa.resample(data[:, ch], orig_sr=orig_sr, target_sr=target_sr) for ch in range(data.shape[1])]
        resampled = np.column_stack(channels)
    else:
        resampled = librosa.resample(data, orig_sr=orig_sr, target_sr=target_sr)
    sf.write(dst_path, resampled, target_sr, subtype="FLOAT")


def _get_inference_device() -> str:
    """Select the best available device for RVC inference."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--voice-id", default="")
    parser.add_argument("--model-path", default="")
    parser.add_argument("--models-dir", default=None)
    parser.add_argument("--index-file", default=None)
    parser.add_argument("--f0-up-key", type=int, default=0)
    parser.add_argument("--index-rate", type=float, default=0.75)
    parser.add_argument("--filter-radius", type=int, default=3)
    parser.add_argument("--protect", type=float, default=0.33)
    parser.add_argument("--rms-mix-rate", type=float, default=0.25)
    args = parser.parse_args()
    result = convert(
        vocals_path=args.input,
        output_dir=args.output_dir,
        voice_id=args.voice_id,
        model_path=args.model_path,
        models_dir=args.models_dir,
        index_file=args.index_file,
        f0_up_key=args.f0_up_key,
        index_rate=args.index_rate,
        filter_radius=args.filter_radius,
        protect=args.protect,
        rms_mix_rate=args.rms_mix_rate,
    )
    print(json.dumps({"output_path": result}))
