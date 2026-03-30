"""RVC (Retrieval-based Voice Conversion) backend.

Uses the rvc_python package (PyPI: rvc-python) for inference.
The import name is rvc_python (underscore), NOT rvc.

Environment variables (set by the TypeScript adapter):
  RMVPE_MODEL_PATH  — path to rmvpe.pt for F0 extraction
  HUBERT_MODEL_PATH — path to hubert_base.pt for content features
"""

import json
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

patch_torch_load()

MODEL_TARGET_SR = 40000
PIPELINE_SR = 44100


def _patched_load_audio(file: str, sr: int) -> np.ndarray:
    """Drop-in replacement for rvc_python.lib.audio.load_audio.

    The bundled load_audio is broken on modern PyAV (av >= 12) because
    ``ostream.channels`` became read-only. We bypass av entirely.
    """
    import subprocess

    try:
        out = subprocess.run(
            ["ffmpeg", "-nostdin", "-loglevel", "error",
             "-i", file,
             "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", str(sr), "-"],
            capture_output=True, check=True, timeout=300,
        )
        return np.frombuffer(out.stdout, np.float32).flatten()
    except Exception:
        data, orig_sr = sf.read(file, dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)
        if orig_sr != sr:
            import librosa
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

# Standard RVC v2 40kHz f0 model architecture config.
# These are the 18 constructor args for SynthesizerTrnMs768NSFsid:
#   spec_channels, segment_size, inter_channels, hidden_channels,
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


def _ensure_inference_format(model_path: str) -> str:
    """Convert training checkpoint to RVC inference format if needed.

    rvc_python.infer expects {weight, config, ...} but training checkpoints
    only have {model, iteration, learning_rate}. This function detects the
    format and converts in-place when necessary.
    """
    import torch

    cpt = torch.load(model_path, map_location="cpu", weights_only=False)
    if not isinstance(cpt, dict):
        return model_path

    if "config" in cpt and "weight" in cpt:
        return model_path

    if "model" not in cpt:
        return model_path

    print(f"Converting training checkpoint to inference format: {model_path}", flush=True)
    inference_cpt = {
        "weight": cpt["model"],
        "config": _RVC_V2_40K_CONFIG,
        "info": "v2-40k-f0 (auto-converted from training checkpoint)",
        "sr": "40k",
        "f0": 1,
        "version": "v2",
    }
    torch.save(inference_cpt, model_path)
    print("Checkpoint converted successfully", flush=True)
    return model_path


def _find_model(voice_id: str, models_dir: str | None = None) -> str | None:
    """Search standard locations for an RVC .pth model file.

    Priority order:
      1. voice_models/{voice_id}/{voice_id}.pth  (new per-voice subdirectory)
      2. {models_dir}/{voice_id}.pth             (legacy flat layout)
      3. package-root/models/voice_models/{voice_id}/{voice_id}.pth
      4. package-root/models/{voice_id}.pth       (legacy fallback)
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
    f0_file: str | None = None,
    index_file: str | None = None,
    index_rate: float = 0.75,
    filter_radius: int = 3,
    rms_mix_rate: float = 0.25,
    protect: float = 0.20,
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
    device = "cuda:0" if _cuda_available() else "cpu"

    idx_path = str(kwargs.get("index_file", index_file or "")) or ""
    if not idx_path and vid:
        idx_path = _find_index(vid, models_directory) or ""

    actual_index_rate = float(kwargs.get("index_rate", index_rate))
    actual_filter_radius = int(kwargs.get("filter_radius", filter_radius))
    actual_f0_up_key = int(kwargs.get("f0_up_key", f0_up_key))
    actual_rms_mix_rate = float(kwargs.get("rms_mix_rate", rms_mix_rate))
    actual_protect = float(kwargs.get("protect", protect))
    actual_f0_file = str(kwargs.get("f0_file", f0_file or "")) or ""
    staged_registry_root = None

    tmp_input = None
    try:
        # Pre-align: resample input to model's native sample rate (40kHz)
        src_info = sf.info(input_path)
        rvc_input = input_path
        if src_info.samplerate != MODEL_TARGET_SR:
            tmp_input = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            tmp_input.close()
            _resample_wav(input_path, tmp_input.name, MODEL_TARGET_SR)
            rvc_input = tmp_input.name
            print(f"Pre-aligned: {src_info.samplerate}Hz -> {MODEL_TARGET_SR}Hz", flush=True)

        load_model_params = inspect.signature(RVCInference.load_model).parameters
        if "index_path" in load_model_params:
            rvc = RVCInference(device=device)
            rvc.load_model(model_path, index_path=idx_path)
            resolved_index_path = idx_path
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
        )

        if actual_f0_file and Path(actual_f0_file).exists():
            from scipy.io import wavfile as scipy_wavfile
            wav_opt = rvc.vc.vc_single(
                sid=0,
                input_audio_path=rvc_input,
                f0_up_key=actual_f0_up_key,
                f0_method=f0_method,
                file_index=resolved_index_path,
                index_rate=actual_index_rate,
                filter_radius=actual_filter_radius,
                resample_sr=rvc.resample_sr,
                rms_mix_rate=actual_rms_mix_rate,
                protect=actual_protect,
                f0_file=actual_f0_file,
                file_index2="",
            )
            scipy_wavfile.write(output_path, rvc.vc.tgt_sr, wav_opt)
        else:
            rvc.infer_file(rvc_input, output_path)

        # Post-align: resample output back to pipeline standard (44.1kHz)
        out_info = sf.info(output_path)
        if out_info.samplerate != PIPELINE_SR:
            _resample_wav(output_path, output_path, PIPELINE_SR)
            print(f"Post-aligned: {out_info.samplerate}Hz -> {PIPELINE_SR}Hz", flush=True)
    except Exception as e:
        raise ConversionError(f"RVC conversion failed: {e!s}") from e
    finally:
        if tmp_input and os.path.exists(tmp_input.name):
            os.unlink(tmp_input.name)
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
    sf.write(dst_path, resampled, target_sr, subtype="PCM_16")


def _cuda_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


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
    parser.add_argument("--f0-file", default=None)
    parser.add_argument("--index-rate", type=float, default=0.75)
    parser.add_argument("--filter-radius", type=int, default=3)
    parser.add_argument("--protect", type=float, default=0.20)
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
        f0_file=args.f0_file,
        index_rate=args.index_rate,
        filter_radius=args.filter_radius,
        protect=args.protect,
        rms_mix_rate=args.rms_mix_rate,
    )
    print(json.dumps({"output_path": result}))
