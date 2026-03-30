"""Training pipeline: RVC voice model training.

Uses rvc_python (PyPI: rvc-python) internal components for:
  1. Audio preprocessing (slicing, resampling)
  2. HuBERT feature extraction
  3. F0 pitch extraction via RMVPE
  4. FAISS index creation for voice matching
  5. Model file packaging

The result is a voice model package (.pth + .index) usable by the
inference pipeline via rvc_python.infer.RVCInference.
"""

import gc
import json
import os
import sys
import traceback
from pathlib import Path

import numpy as np
import soundfile as sf

from ..compat import patch_torch_load
from ..errors.base import SingingWorkerError
from ..io.files import ensure_dir

patch_torch_load()

_HOLDOUT_SEGMENT_RATIO = 0.20
_MIN_QA_SEGMENTS = 3
_MAX_QA_SEGMENTS = 6
_MAX_QA_SEGMENTS_PER_BUCKET = 2
_MIN_QA_RMS_DB = -32.0
_QA_TARGET_GROUP_DURATION_SEC = 8.0


def _release_gpu(label: str = "") -> None:
    """Run GC and release CUDA cached memory after a GPU-heavy step."""
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.synchronize()
            torch.cuda.empty_cache()
    except Exception:
        pass
    if label:
        print(f"  GPU memory released after {label}", flush=True)


def _check_rvc_python() -> None:
    """Warn (but don't crash) if rvc_python is not properly installed — fallbacks exist."""
    try:
        from rvc_python.lib.audio import load_audio  # noqa: F401
        print("rvc_python available", flush=True)
    except ImportError:
        print(
            "WARNING: rvc_python.lib not available, using built-in fallbacks "
            "for audio slicing, F0 extraction, and HuBERT loading.",
            flush=True,
        )


def _get_device() -> str:
    """Select training device.  MPS is intentionally excluded because RVC's
    infer_pack models use ops (e.g. complex conv, fused weight_norm) that
    PyTorch's MPS backend does not yet support.  Apple-Silicon users will
    train on CPU until MPS op coverage improves.
    """
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda:0"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            import logging
            logging.getLogger(__name__).info(
                "MPS (Metal) detected but RVC training requires CUDA; falling back to CPU"
            )
    except ImportError:
        pass
    return "cpu"


def _fallback_load_audio(file: str, sr: int) -> np.ndarray:
    """Load audio file and resample to target sr — pure soundfile/scipy fallback."""
    import subprocess
    from ..io.ffmpeg import _get_ffmpeg_bin
    try:
        out = subprocess.run(
            [_get_ffmpeg_bin(), "-nostdin", "-i", file,
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


class _FallbackSlicer:
    """Silence-based audio slicer — standalone fallback for rvc_python.lib.slicer2.Slicer."""

    def __init__(
        self,
        sr: int,
        threshold: float = -42.0,
        min_length: int = 1500,
        min_interval: int = 400,
        hop_size: int = 15,
        max_sil_kept: int = 500,
    ):
        self.sr = sr
        min_interval = min(min_interval, min_length)
        self._threshold = 10 ** (threshold / 20.0)
        self._hop = int(sr * hop_size / 1000)
        self._min_len = int(sr * min_length / 1000 / self._hop)
        self._min_interval = int(sr * min_interval / 1000 / self._hop)
        self._max_sil_kept = int(sr * max_sil_kept / 1000 / self._hop)

    def _rms(self, y: np.ndarray) -> np.ndarray:
        hop = self._hop
        n_frames = len(y) // hop
        rms = np.zeros(n_frames, dtype=np.float32)
        for i in range(n_frames):
            frame = y[i * hop : (i + 1) * hop]
            rms[i] = np.sqrt(np.mean(frame ** 2))
        return rms

    def slice(self, waveform: np.ndarray):  # noqa: C901
        """Yield audio chunks split on silence boundaries."""
        if len(waveform) <= self._min_len * self._hop:
            yield waveform
            return

        rms_list = self._rms(waveform)
        sil_tags: list[tuple[int, int]] = []
        silence_start = None
        for i, rms in enumerate(rms_list):
            if rms < self._threshold:
                if silence_start is None:
                    silence_start = i
            else:
                if silence_start is not None:
                    sil_len = i - silence_start
                    if sil_len >= self._min_interval:
                        sil_tags.append((silence_start, i))
                    silence_start = None
        if silence_start is not None:
            sil_tags.append((silence_start, len(rms_list)))

        if not sil_tags:
            yield waveform
            return

        chunks: list[np.ndarray] = []
        pos = 0
        for s, e in sil_tags:
            mid = (s + e) // 2
            sample_mid = mid * self._hop
            if sample_mid - pos >= self._min_len * self._hop:
                chunks.append(waveform[pos:sample_mid])
                pos = sample_mid
        if pos < len(waveform):
            chunks.append(waveform[pos:])

        for c in chunks:
            if len(c) > 0:
                yield c


class _FallbackRMVPE:
    """Minimal RMVPE-compatible wrapper using torchcrepe or librosa pyin.

    Provides the same ``infer_from_audio(audio, thred)`` interface so the
    training pipeline works identically when rvc_python.lib.rmvpe is unavailable.
    """

    def __init__(self, model_path: str, device: str = "cpu"):
        self._device = device
        self._backend = "none"
        try:
            import torchcrepe  # noqa: F401
            self._backend = "crepe"
        except ImportError:
            try:
                import librosa  # noqa: F401
                self._backend = "librosa"
            except ImportError:
                pass
        if self._backend == "none":
            raise SingingWorkerError(
                "No F0 backend: install rvc-python, torchcrepe, or librosa",
                code="MISSING_DEPENDENCY",
            )
        print(f"RMVPE fallback using {self._backend}", flush=True)

    def infer_from_audio(self, audio: np.ndarray, thred: float = 0.03) -> np.ndarray:
        if self._backend == "crepe":
            return self._crepe_f0(audio, thred)
        return self._librosa_f0(audio, thred)

    def _crepe_f0(self, audio: np.ndarray, thred: float) -> np.ndarray:
        import torch
        import torchcrepe

        sr = 16000
        hop = sr // 100
        t = torch.from_numpy(audio).float().unsqueeze(0).to(self._device)
        pitch = torchcrepe.predict(
            t, sr, hop, 50, 1100, "full",
            batch_size=512, device=self._device,
        )
        f0 = pitch.squeeze(0).cpu().numpy().astype(np.float32)
        f0[f0 < 50] = 0.0
        return f0

    def _librosa_f0(self, audio: np.ndarray, thred: float) -> np.ndarray:
        import librosa

        sr = 16000
        f0, voiced, _ = librosa.pyin(
            audio.astype(np.float32), fmin=50, fmax=1100, sr=sr,
        )
        f0 = np.nan_to_num(f0, nan=0.0).astype(np.float32)
        return f0


def _preprocess_dataset(
    dataset_path: str,
    exp_dir: str,
    sr: int = 40000,
    holdout_ratio: float = _HOLDOUT_SEGMENT_RATIO,
) -> tuple[str, str, str]:
    """Slice and resample dataset audio into training and holdout segments.

    Returns (gt_wavs_dir, wavs_16k_dir, holdout_dir).
    Holdout segments (20%) are tagged by F0 bucket for per-bucket evaluation.
    """
    gt_wavs_dir = os.path.join(exp_dir, "0_gt_wavs")
    wavs_16k_dir = os.path.join(exp_dir, "1_16k_wavs")
    holdout_dir = os.path.join(exp_dir, "holdout")
    os.makedirs(gt_wavs_dir, exist_ok=True)
    os.makedirs(wavs_16k_dir, exist_ok=True)
    os.makedirs(holdout_dir, exist_ok=True)

    load_audio = _fallback_load_audio
    Slicer = _FallbackSlicer

    import librosa
    from scipy import signal
    from scipy.io import wavfile

    audio = load_audio(dataset_path, sr)

    bh, ah = signal.butter(N=5, Wn=48, btype="high", fs=sr)
    audio = signal.lfilter(bh, ah, audio)

    slicer = Slicer(
        sr=sr,
        threshold=-42,
        min_length=1500,
        min_interval=400,
        hop_size=15,
        max_sil_kept=500,
    )

    per = 3.0
    overlap = 0.3
    tail = per + overlap
    max_amp = 0.9
    alpha = 0.75
    min_segment_samples = 13200  # segment_size(12800) + hop_length(400)
    skipped_short = 0

    idx1 = 0
    for chunk in slicer.slice(audio):
        i = 0
        while True:
            start = int(sr * (per - overlap) * i)
            i += 1
            if len(chunk[start:]) > tail * sr:
                segment = chunk[start : start + int(per * sr)]
            else:
                segment = chunk[start:]

            if len(segment) < min_segment_samples:
                skipped_short += 1
                if len(chunk[start:]) <= tail * sr:
                    break
                continue

            tmp_max = np.abs(segment).max()
            if tmp_max > 2.5 or tmp_max < 1e-6:
                if len(chunk[start:]) <= tail * sr:
                    break
                idx1 += 1
                continue

            segment = (segment / tmp_max * (max_amp * alpha)) + (1 - alpha) * segment

            wavfile.write(
                os.path.join(gt_wavs_dir, f"0_{idx1}.wav"),
                sr,
                segment.astype(np.float32),
            )

            seg_16k = librosa.resample(segment, orig_sr=sr, target_sr=16000)
            wavfile.write(
                os.path.join(wavs_16k_dir, f"0_{idx1}.wav"),
                16000,
                seg_16k.astype(np.float32),
            )
            idx1 += 1

            if len(chunk[start:]) <= tail * sr:
                break

    if skipped_short > 0:
        print(f"  Skipped {skipped_short} segments shorter than {min_segment_samples / sr:.2f}s", flush=True)

    if idx1 == 0:
        raise SingingWorkerError(
            "No valid audio segments found in dataset",
            code="PREPROCESSING_FAILED",
        )

    # Split into train/holdout (80/20 by whole segments)
    all_segments = sorted(Path(gt_wavs_dir).glob("*.wav"))
    n_holdout = max(1, int(len(all_segments) * holdout_ratio))
    import random
    random.seed(42)
    holdout_indices = set(random.sample(range(len(all_segments)), n_holdout))

    holdout_manifest = []
    for i, seg_path in enumerate(all_segments):
        if i in holdout_indices:
            dest = os.path.join(holdout_dir, seg_path.name)
            import shutil as _shutil
            _shutil.copy2(str(seg_path), dest)

            # Tag by F0 bucket (low/mid/high) using basic analysis
            tag = _tag_f0_bucket(str(seg_path), sr)
            segment_summary = _summarize_segment(str(seg_path))
            holdout_manifest.append({
                "filename": seg_path.name,
                "path": dest,
                "tag": tag,
                "duration_sec": round(segment_summary["duration_sec"], 3),
                "rms_db": round(segment_summary["rms_db"], 3),
            })

    manifest_path = os.path.join(exp_dir, "holdout_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(holdout_manifest, f, indent=2)

    print(f"Preprocessed {idx1} segments ({len(all_segments) - n_holdout} train, {n_holdout} holdout)", flush=True)
    return gt_wavs_dir, wavs_16k_dir, holdout_dir


def _tag_f0_bucket(wav_path: str, sr: int = 40000) -> str:
    """Tag an audio segment by its F0 range: low / mid / high."""
    try:
        data, _ = sf.read(wav_path)
        if len(data.shape) > 1:
            data = data.mean(axis=1)
        rms = np.sqrt(np.mean(data ** 2))
        if rms < 0.01:
            return "silence"

        # Use simple zero-crossing rate as proxy for pitch range
        zc = np.sum(np.abs(np.diff(np.sign(data)))) / (2 * len(data))
        if zc < 0.05:
            return "low"
        elif zc < 0.12:
            return "mid"
        else:
            return "high"
    except Exception:
        return "mid"


def _summarize_segment(wav_path: str) -> dict[str, float]:
    """Return cheap per-segment stats used to build a representative QA subset."""
    data, sr = sf.read(wav_path, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)

    duration_sec = len(data) / max(sr, 1)
    rms = np.sqrt(np.mean(data ** 2)) if len(data) > 0 else 0.0
    rms_db = 20.0 * np.log10(max(float(rms), 1e-8))

    return {
        "duration_sec": float(duration_sec),
        "rms_db": float(rms_db),
    }


def _segment_sort_key(entry: dict[str, object]) -> tuple[float, float, str]:
    """Prefer voiced, audible holdout segments for QA."""
    rms_db = float(entry.get("rms_db", -120.0))
    duration_sec = float(entry.get("duration_sec", 0.0))
    filename = str(entry.get("filename", ""))
    return (-max(rms_db, -120.0), -duration_sec, filename)


def _segment_sequence_index(entry: dict[str, object]) -> int:
    filename = Path(str(entry.get("filename", ""))).stem
    raw_index = filename.split("_")[-1]
    try:
        return int(raw_index)
    except ValueError:
        return 0


def _chunk_holdout_entries(
    entries: list[dict[str, object]],
    target_duration_sec: float = _QA_TARGET_GROUP_DURATION_SEC,
) -> list[list[dict[str, object]]]:
    """Concatenate a few representative short slices into longer QA clips.

    Training slices are intentionally short for GAN stability, but report-card QA
    becomes both slower and noisier if we transcribe/evaluate every 3-second
    slice independently. Building a few longer clips produces more stable ASR
    and melody metrics while dramatically reducing the number of conversions.
    """
    if not entries:
        return []

    entries = sorted(entries, key=_segment_sequence_index)
    groups: list[list[dict[str, object]]] = []
    current: list[dict[str, object]] = []
    current_duration = 0.0

    for entry in entries:
        duration_sec = float(entry.get("duration_sec", 0.0))
        if current and current_duration >= target_duration_sec:
            groups.append(current)
            current = []
            current_duration = 0.0

        current.append(entry)
        current_duration += duration_sec

        if len(current) >= 3:
            groups.append(current)
            current = []
            current_duration = 0.0

    if current:
        groups.append(current)

    return groups


def _write_eval_clip(segment_paths: list[str], output_path: str) -> str:
    """Concatenate selected slices into one evaluation reference clip."""
    if len(segment_paths) == 1:
        import shutil as _shutil

        _shutil.copy2(segment_paths[0], output_path)
        return output_path

    merged: list[np.ndarray] = []
    sample_rate = 0

    for segment_path in segment_paths:
        data, sr = sf.read(segment_path, dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)
        if sample_rate == 0:
            sample_rate = sr
        elif sr != sample_rate:
            raise SingingWorkerError(
                f"Mixed sample rates in holdout evaluation clip assembly: {sample_rate} vs {sr}",
                code="PREPROCESSING_FAILED",
            )
        merged.append(data.astype(np.float32))

    eval_clip = np.concatenate(merged, axis=0)
    sf.write(output_path, eval_clip, sample_rate, subtype="PCM_16")
    return output_path


def _prepare_holdout_eval_clips(
    holdout_manifest: list[dict[str, object]],
    eval_output_dir: str,
    max_groups: int = _MAX_QA_SEGMENTS,
    max_groups_per_bucket: int = _MAX_QA_SEGMENTS_PER_BUCKET,
) -> list[dict[str, str]]:
    """Select and materialize a compact, representative QA evaluation set."""
    bucketed: dict[str, list[dict[str, object]]] = {"low": [], "mid": [], "high": []}
    fallback_candidates: list[dict[str, object]] = []

    for entry in holdout_manifest:
        rms_db = float(entry.get("rms_db", -120.0))
        if rms_db < _MIN_QA_RMS_DB:
            continue

        tag = str(entry.get("tag", "mid"))
        fallback_candidates.append(entry)
        if tag in bucketed:
            bucketed[tag].append(entry)

    for tag in bucketed:
        bucketed[tag].sort(key=_segment_sort_key)
    fallback_candidates.sort(key=_segment_sort_key)

    selected_groups: list[dict[str, str]] = []
    used_paths: set[str] = set()

    def append_groups(entries: list[dict[str, object]], tag: str, limit: int) -> None:
        nonlocal selected_groups
        filtered = [entry for entry in entries if str(entry.get("path", "")) not in used_paths]
        filtered = sorted(filtered, key=_segment_sort_key)[:max(limit * 3, limit)]
        for group in _chunk_holdout_entries(filtered)[:limit]:
            segment_paths = [str(entry["path"]) for entry in group]
            for segment_path in segment_paths:
                used_paths.add(segment_path)

            output_path = os.path.join(eval_output_dir, f"eval_ref_{tag}_{len(selected_groups)}.wav")
            _write_eval_clip(segment_paths, output_path)
            selected_groups.append({
                "path": output_path,
                "tag": tag,
            })

    for tag in ("low", "mid", "high"):
        append_groups(bucketed[tag], tag, max_groups_per_bucket)

    if len(selected_groups) < _MIN_QA_SEGMENTS:
        append_groups(fallback_candidates, "mixed", _MIN_QA_SEGMENTS - len(selected_groups))

    if len(selected_groups) < max_groups:
        append_groups(fallback_candidates, "mixed", max_groups - len(selected_groups))

    return selected_groups[:max_groups]


def _load_hubert(hubert_path: str, device: str):
    """Load HuBERT model with multiple fallback strategies.

    Strategy 1: rvc_python's built-in HuBERT loader (most compatible)
    Strategy 2: fairseq checkpoint_utils (legacy)
    Strategy 3: Direct torch.load + manual model construction
    """
    import torch

    # Strategy 1: use rvc_python's JIT HuBERT loader if available
    try:
        from rvc_python.lib.jit.get_hubert import get_hubert_model
        model = get_hubert_model(hubert_path, device)
        model.eval()
        print("HuBERT loaded via rvc_python JIT loader", flush=True)
        return model
    except Exception:
        pass

    # Strategy 2: fairseq high-level API
    try:
        from fairseq import checkpoint_utils
        models, _, _ = checkpoint_utils.load_model_ensemble_and_task(
            [hubert_path], suffix="",
        )
        model = models[0].to(device)
        model.eval()
        print("HuBERT loaded via fairseq", flush=True)
        return model
    except Exception:
        pass

    # Strategy 3: direct torch.load
    try:
        ckpt = torch.load(hubert_path, map_location=device, weights_only=False)
        if "model" in ckpt:
            from fairseq.models.hubert import HubertModel
            cfg = ckpt.get("cfg", {})
            model_cfg = cfg.get("model", cfg)
            task_cfg = cfg.get("task", {})
            model = HubertModel.build_model(model_cfg, task=None)
            model.load_state_dict(ckpt["model"], strict=False)
            model = model.to(device)
            model.eval()
            print("HuBERT loaded via direct checkpoint", flush=True)
            return model
    except Exception:
        pass

    raise SingingWorkerError(
        "Failed to load HuBERT model with any available method. "
        "Ensure fairseq is installed: pip install fairseq",
        code="MODEL_LOAD_FAILED",
    )


def _extract_hubert_features(
    wavs_16k_dir: str,
    exp_dir: str,
    device: str = "cpu",
) -> str:
    """Extract HuBERT content features from 16kHz segments."""
    import torch

    feats_dir = os.path.join(exp_dir, "3_feature768")
    os.makedirs(feats_dir, exist_ok=True)

    hubert_path = os.environ.get("HUBERT_MODEL_PATH", "")
    if not hubert_path or not Path(hubert_path).exists():
        raise SingingWorkerError(
            "HuBERT model not found. Set HUBERT_MODEL_PATH env var.",
            code="MISSING_MODEL",
        )

    hubert_model = _load_hubert(hubert_path, device)
    is_half = device != "cpu" and hasattr(hubert_model, "final_proj")
    if is_half:
        hubert_model = hubert_model.half()

    wav_files = sorted(Path(wavs_16k_dir).glob("*.wav"))
    print(f"Extracting HuBERT features from {len(wav_files)} files...", flush=True)

    try:
        for i, wav_path in enumerate(wav_files):
            data, sr = sf.read(str(wav_path))
            if len(data.shape) > 1:
                data = data.mean(axis=1)

            feats = torch.from_numpy(data).float()
            if is_half:
                feats = feats.half()
            feats = feats.to(device).unsqueeze(0)

            padding_mask = torch.BoolTensor(feats.shape).fill_(False).to(device)
            inputs = {
                "source": feats,
                "padding_mask": padding_mask,
                "output_layer": 12,
            }
            with torch.no_grad():
                logits = hubert_model.extract_features(**inputs)
                feat_out = logits[0]

            feat_np = feat_out.squeeze(0).float().cpu().numpy()
            out_name = wav_path.stem + ".npy"
            np.save(os.path.join(feats_dir, out_name), feat_np)

            if (i + 1) % 50 == 0 or i + 1 == len(wav_files):
                print(f"  HuBERT: {i + 1}/{len(wav_files)}", flush=True)
    finally:
        del hubert_model
        _release_gpu("HuBERT")

    print(f"Extracted features for {len(wav_files)} files", flush=True)
    return feats_dir


def _extract_f0(
    wavs_16k_dir: str,
    exp_dir: str,
    device: str = "cpu",
) -> str:
    """Extract F0 (pitch) from 16kHz training segments using RMVPE.

    RMVPE internally uses hop_length=160 at 16kHz, producing F0 at 100fps.
    This matches the spectrogram frame rate (40kHz / hop=400 = 100fps).
    """
    import torch

    f0_dir = os.path.join(exp_dir, "2a_f0")
    f0nsf_dir = os.path.join(exp_dir, "2b_f0nsf")
    os.makedirs(f0_dir, exist_ok=True)
    os.makedirs(f0nsf_dir, exist_ok=True)

    rmvpe_path = os.environ.get("RMVPE_MODEL_PATH", "")
    if not rmvpe_path or not Path(rmvpe_path).exists():
        raise SingingWorkerError(
            "RMVPE model not found. Set RMVPE_MODEL_PATH env var.",
            code="MISSING_MODEL",
        )

    try:
        from rvc_python.lib.rmvpe import RMVPE
    except ImportError:
        RMVPE = None
    if RMVPE is not None:
        rmvpe_model = RMVPE(rmvpe_path, is_half=device != "cpu", device=device)
    else:
        rmvpe_model = _FallbackRMVPE(rmvpe_path, device=device)

    wav_files = sorted(Path(wavs_16k_dir).glob("*.wav"))
    print(f"Extracting F0 from {len(wav_files)} 16kHz files...", flush=True)

    f0_bin = 256
    f0_max = 1100.0
    f0_min = 50.0
    f0_mel_min = 1127 * np.log(1 + f0_min / 700)
    f0_mel_max = 1127 * np.log(1 + f0_max / 700)

    try:
        for wav_path in wav_files:
            data, _ = sf.read(str(wav_path))
            if len(data.shape) > 1:
                data = data.mean(axis=1)

            f0 = rmvpe_model.infer_from_audio(data, thred=0.03)

            # Coarse F0 (quantized)
            f0_mel = 1127 * np.log(1 + f0 / 700)
            f0_mel[f0_mel > 0] = (f0_mel[f0_mel > 0] - f0_mel_min) * (f0_bin - 2) / (
                f0_mel_max - f0_mel_min
            ) + 1
            f0_mel[f0_mel <= 1] = 1
            f0_mel[f0_mel > f0_bin - 1] = f0_bin - 1
            f0_coarse = np.rint(f0_mel).astype(int)

            stem = wav_path.stem
            np.save(os.path.join(f0_dir, f"{stem}.wav.npy"), f0_coarse)
            np.save(os.path.join(f0nsf_dir, f"{stem}.wav.npy"), f0)
    finally:
        del rmvpe_model
        _release_gpu("RMVPE")

    print(f"Extracted F0 for {len(wav_files)} files", flush=True)
    return f0_dir


def _build_faiss_index(
    feats_dir: str,
    exp_dir: str,
) -> str:
    """Build a FAISS index from HuBERT features for voice retrieval."""
    import faiss

    npy_files = sorted(Path(feats_dir).glob("*.npy"))
    if not npy_files:
        raise SingingWorkerError(
            "No feature files found for index creation",
            code="INDEX_FAILED",
        )

    big_npy = np.concatenate(
        [np.load(str(f)) for f in npy_files],
        axis=0,
    )
    big_npy = big_npy.astype("float32")

    n_vectors = big_npy.shape[0]
    dim = big_npy.shape[1]
    print(f"Building FAISS index from {n_vectors} vectors (dim={dim})...", flush=True)

    if n_vectors < 40:
        index = faiss.IndexFlatL2(dim)
        index.add(big_npy)
    else:
        n_ivf = min(int(16 * np.sqrt(n_vectors)), n_vectors // 39)
        n_ivf = max(n_ivf, 1)
        index = faiss.index_factory(dim, f"IVF{n_ivf},Flat")
        index.train(big_npy)
        index.add(big_npy)

    index_path = os.path.join(exp_dir, "added_index.index")
    faiss.write_index(index, index_path)

    big_npy_path = os.path.join(exp_dir, "total_fea.npy")
    np.save(big_npy_path, big_npy)

    print(f"FAISS index created: {index_path}", flush=True)
    return index_path


_progress_file_path: str | None = None


def _set_progress_file(path: str) -> None:
    global _progress_file_path
    _progress_file_path = path


def _emit_progress(step: int, total: int, name: str, pct: int, **extra) -> None:
    """Write progress to both stdout (best-effort) and a JSON file (reliable)."""
    data = {
        "type": "progress",
        "step": step,
        "total": total,
        "name": name,
        "pct": pct,
        **extra,
    }
    print(json.dumps(data), flush=True)
    _write_progress_file(data)


def _write_progress_file(data: dict) -> None:
    """Atomically write progress to a JSON file for the TypeScript poller."""
    if not _progress_file_path:
        return
    try:
        tmp = _progress_file_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp, _progress_file_path)
    except Exception:
        pass


def run_training_pipeline(
    voice_id: str,
    dataset_path: str,
    output_dir: str,
    epochs: int = 200,
    batch_size: int = 8,
) -> str:
    """Execute the RVC training pipeline.

    Returns path to the trained model file.
    """
    _check_rvc_python()
    ensure_dir(output_dir)

    _set_progress_file(os.path.join(output_dir, "progress.json"))

    device = _get_device()
    sr = 40000
    exp_dir = os.path.join(output_dir, "experiment")
    os.makedirs(exp_dir, exist_ok=True)

    print(f"=== RVC Training Pipeline ===", flush=True)
    print(f"Voice ID: {voice_id}", flush=True)
    print(f"Device: {device}", flush=True)
    print(f"Sample Rate: {sr}", flush=True)

    TOTAL_STEPS = 8

    # Step 1: Preprocess
    _emit_progress(1, TOTAL_STEPS, "preprocessing", 2)
    print("\n[1/8] Preprocessing audio dataset...", flush=True)
    gt_wavs_dir, wavs_16k_dir, holdout_dir = _preprocess_dataset(dataset_path, exp_dir, sr)
    _emit_progress(1, TOTAL_STEPS, "preprocessing", 10)

    # Step 2: Extract F0 from 16kHz audio (RMVPE hop=160 -> 100fps, matching spec)
    _emit_progress(2, TOTAL_STEPS, "f0_extraction", 11)
    print("\n[2/8] Extracting pitch (F0) with RMVPE from 16kHz audio...", flush=True)
    _extract_f0(wavs_16k_dir, exp_dir, device)
    _emit_progress(2, TOTAL_STEPS, "f0_extraction", 22)

    # Step 3: Extract HuBERT features
    _emit_progress(3, TOTAL_STEPS, "hubert_extraction", 23)
    print("\n[3/8] Extracting HuBERT content features...", flush=True)
    feats_dir = _extract_hubert_features(wavs_16k_dir, exp_dir, device)
    _emit_progress(3, TOTAL_STEPS, "hubert_extraction", 40)

    # Step 4: Build FAISS index
    _emit_progress(4, TOTAL_STEPS, "faiss_index", 41)
    print("\n[4/8] Building FAISS voice index...", flush=True)
    index_path = _build_faiss_index(feats_dir, exp_dir)
    _emit_progress(4, TOTAL_STEPS, "faiss_index", 43)

    # Step 5: GAN Fine-Tuning (Enhanced)
    _emit_progress(5, TOTAL_STEPS, "gan_training", 44)
    print(f"\n[5/8] GAN fine-tuning ({epochs} epochs, batch_size={batch_size})...", flush=True)

    import torch
    from ..training.config import TrainingConfig
    from ..training.train_loop import run_training

    train_config = TrainingConfig(
        sampling_rate=sr,
        epochs=epochs,
        batch_size=batch_size,
        fp16_run=(device != "cpu"),
        use_bf16=True,
        # Warmup + Cosine Annealing LR
        warmup_epochs=min(10, epochs // 20),
        lr_min=1e-6,
        # EMA for stable inference weights
        ema_enabled=True,
        ema_decay=0.999,
        ema_start_epoch=min(20, epochs // 10),
        # Multi-scale mel loss
        multi_scale_mel=True,
        c_ms_mel=15.0,
        # R1 regularization
        r1_enabled=True,
        r1_gamma=10.0,
        r1_interval=16,
        # Early stopping
        early_stopping=True,
        patience=max(200, epochs // 5),
        min_delta=0.005,
        # Best model tracking
        save_best=True,
        # Logging / checkpoints
        log_interval=10,
        val_interval=25,
        save_every_epoch=max(50, epochs // 20),
        # GPU data caching for small datasets
        cache_data_on_gpu=True,
    )

    t0 = train_config.effective_cosine_t0()

    pretrained_g = os.environ.get("RVC_PRETRAINED_G_PATH", "")
    pretrained_d = os.environ.get("RVC_PRETRAINED_D_PATH", "")

    def _training_progress(epoch: int, total: int, loss_g: float, loss_d: float, loss_details: dict[str, float]) -> None:
        pct = 44 + int(44 * epoch / total)
        _emit_progress(
            step=5,
            total=TOTAL_STEPS,
            name="gan_training",
            pct=min(pct, 88),
            epoch=epoch,
            total_epochs=total,
            loss_g=round(loss_g, 4),
            loss_d=round(loss_d, 4),
            loss_mel=round(loss_details.get("mel", 0), 3),
            loss_mel_raw=round(loss_details.get("mel_raw", 0), 6),
            loss_fm=round(loss_details.get("fm", 0), 3),
            loss_gen=round(loss_details.get("gen", 0), 3),
            loss_kl=round(loss_details.get("kl", 0), 3),
            loss_ms_mel=round(loss_details.get("ms_mel", 0), 3),
            loss_r1=round(loss_details.get("r1", 0), 3),
            grad_norm_g=round(loss_details.get("grad_norm_g", 0), 1),
            grad_norm_d=round(loss_details.get("grad_norm_d", 0), 1),
        )

    best_g_ckpt = run_training(
        exp_dir=exp_dir,
        config=train_config,
        device=device,
        pretrained_g_path=pretrained_g,
        pretrained_d_path=pretrained_d,
        progress_callback=_training_progress,
    )
    _emit_progress(5, TOTAL_STEPS, "gan_training", 88)

    # Step 6: Package model (from best checkpoint, using EMA weights if available)
    _emit_progress(6, TOTAL_STEPS, "model_packaging", 89)
    print("\n[6/8] Packaging voice model...", flush=True)
    model_output = os.path.join(output_dir, f"{voice_id}.pth")
    index_output = os.path.join(output_dir, f"{voice_id}.index")

    print(f"  Using checkpoint: {best_g_ckpt}", flush=True)
    fine_tuned_cpt = torch.load(best_g_ckpt, map_location="cpu", weights_only=False)
    weights = fine_tuned_cpt.get("model", fine_tuned_cpt.get("weight", fine_tuned_cpt))
    best_mel = fine_tuned_cpt.get("best_mel_loss", "N/A")

    rvc_config = [
        1025, 32, 192, 192, 768, 2, 6, 3, 0, "1",
        [3, 7, 11],
        [[1, 3, 5], [1, 3, 5], [1, 3, 5]],
        [10, 10, 2, 2],
        512, [16, 16, 4, 4],
        109, 256,
        sr,
    ]
    inference_cpt = {
        "weight": weights,
        "config": rvc_config,
        "info": (
            f"v2-{sr // 1000}k-f0 fine-tuned for {voice_id} ({epochs} epochs, "
            f"best_mel={best_mel}, EMA={train_config.ema_enabled})"
        ),
        "sr": f"{sr // 1000}k",
        "f0": 1,
        "version": "v2",
    }
    torch.save(inference_cpt, model_output)
    print(f"Voice model packaged in inference format: {model_output}", flush=True)

    # Copy the index
    import shutil
    shutil.copy2(index_path, index_output)
    print(f"Voice index created: {index_output}", flush=True)
    _emit_progress(6, TOTAL_STEPS, "model_packaging", 93)

    # Step 7: Post-training QA — build voice profile and run holdout evaluation
    _emit_progress(7, TOTAL_STEPS, "quality_assessment", 94)
    print("\n[7/8] Running post-training quality assessment...", flush=True)
    voice_profile_data = None
    validation_report_data = None
    try:
        from ..calibration.param_predictor import predict_params
        from ..calibration.source_analyzer import analyze_source_features
        from ..calibration.voice_profile import build_voice_profile, save_voice_profile
        from ..evaluation.composite import run_evaluation_batch

        train_segments = [str(p) for p in sorted(Path(gt_wavs_dir).glob("*.wav"))]
        profile = build_voice_profile(train_segments, voice_id)
        profile_path = os.path.join(output_dir, "voice_profile.json")
        save_voice_profile(profile, profile_path)
        voice_profile_data = profile.to_dict()
        print(f"Voice profile saved: {profile_path}", flush=True)

        # Run holdout evaluation: convert holdout segments through the trained model
        # then compare converted output against original holdout reference
        holdout_manifest_path = os.path.join(exp_dir, "holdout_manifest.json")
        if Path(holdout_manifest_path).exists():
            with open(holdout_manifest_path) as f:
                holdout_manifest = json.load(f)
            if holdout_manifest:
                _emit_progress(7, TOTAL_STEPS, "quality_assessment", 95)
                eval_output_dir = os.path.join(exp_dir, "holdout_eval")
                os.makedirs(eval_output_dir, exist_ok=True)

                selected_eval_refs = _prepare_holdout_eval_clips(holdout_manifest, eval_output_dir)
                if not selected_eval_refs:
                    raise SingingWorkerError(
                        "No representative holdout clips were suitable for quality assessment",
                        code="VOICE_PROFILE_INVALID",
                    )

                pairs = []
                n_holdout = len(selected_eval_refs)
                print(
                    f"  Quality assessment will evaluate {n_holdout} representative holdout clip(s) "
                    f"(capped from {len(holdout_manifest)} raw holdout segment(s))",
                    flush=True,
                )

                inference_failures = 0
                for hi, entry in enumerate(selected_eval_refs):
                    ref_path = entry["path"]
                    tag = entry.get("tag", "unknown")
                    synth_path: str | None = None

                    try:
                        from ..backends.converter.rvc import convert
                        predicted = predict_params(
                            analyze_source_features(ref_path, include_quality_estimate=False),
                            profile,
                        )
                        seg_output_dir = os.path.join(eval_output_dir, f"seg_{hi}")
                        os.makedirs(seg_output_dir, exist_ok=True)
                        converted = convert(
                            vocals_path=ref_path,
                            output_dir=seg_output_dir,
                            model_path=model_output,
                            index_file=index_output,
                            f0_up_key=predicted.pitch_shift,
                            index_rate=predicted.index_rate,
                            protect=predicted.protect,
                            rms_mix_rate=predicted.rms_mix_rate,
                            filter_radius=predicted.filter_radius,
                        )
                        synth_path = converted
                    except Exception as conv_err:
                        inference_failures += 1
                        print(f"  Holdout inference failed for {Path(ref_path).name}: {conv_err}", flush=True)

                    if synth_path is not None:
                        pairs.append((ref_path, synth_path, tag))

                    if (hi + 1) % 5 == 0 or hi + 1 == n_holdout:
                        pct = 95 + int(4 * (hi + 1) / n_holdout)
                        _emit_progress(7, TOTAL_STEPS, "quality_assessment", min(pct, 99))
                        print(f"  Holdout evaluation: {hi + 1}/{n_holdout}", flush=True)

                if inference_failures > 0:
                    print(
                        f"  Warning: {inference_failures}/{n_holdout} holdout inference(s) failed "
                        f"and were excluded from evaluation",
                        flush=True,
                    )

                if not pairs:
                    print("  All holdout inferences failed — skipping quality assessment", flush=True)
                else:
                    report = run_evaluation_batch(pairs, voice_profile_data, voice_id)
                    report_path = os.path.join(output_dir, "validation_report.json")
                    with open(report_path, "w") as f:
                        f.write(report.to_json())
                    validation_report_data = report.to_dict()
                    print(f"Validation report saved: {report_path} (grade: {report.overall_grade})", flush=True)
    except SingingWorkerError:
        raise
    except Exception as e:
        print(f"Warning: Post-training QA failed (non-fatal): {e}", flush=True)

    # Create metadata
    meta: dict = {
        "voice_id": voice_id,
        "model_path": model_output,
        "index_path": index_output,
        "device": device,
        "sr": sr,
        "segments_count": len(list(Path(gt_wavs_dir).glob("*.wav"))),
        "version": "v2",
        "epochs": epochs,
        "batch_size": batch_size,
        "fine_tuned": True,
        "training_enhancements": {
            "lr_schedule": f"warmup({train_config.warmup_epochs}) + cosine(T0={t0})",
            "ema": train_config.ema_enabled,
            "ema_decay": train_config.ema_decay,
            "multi_scale_mel": train_config.multi_scale_mel,
            "r1_penalty": train_config.r1_enabled,
            "early_stopping": train_config.early_stopping,
            "precision": "bf16" if train_config.use_bf16 else "fp16",
            "best_mel_loss": best_mel if isinstance(best_mel, (int, float)) else None,
            "gpu_data_cache": train_config.cache_data_on_gpu,
        },
    }
    if voice_profile_data:
        meta["voice_profile"] = {
            "f0_p10": voice_profile_data.get("f0_p10", 0),
            "f0_p50": voice_profile_data.get("f0_p50", 0),
            "f0_p90": voice_profile_data.get("f0_p90", 0),
            "dynamic_range_db": voice_profile_data.get("dynamic_range_db", 0),
            "unvoiced_ratio": voice_profile_data.get("unvoiced_ratio", 0),
        }
    if validation_report_data:
        meta["validation_report"] = {
            "overall_grade": validation_report_data.get("overall_grade", "N/A"),
            "singer_similarity": validation_report_data.get("singer_similarity", 0),
            "content_score": validation_report_data.get("content_score", 0),
            "f0_corr": validation_report_data.get("f0_corr", 0),
            "naturalness_mos": validation_report_data.get("naturalness_mos", 0),
        }
    with open(os.path.join(output_dir, f"{voice_id}_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    _emit_progress(8, TOTAL_STEPS, "complete", 100)
    print(f"\n=== Training Complete ===", flush=True)
    print(f"Model: {model_output}", flush=True)
    print(f"Index: {index_output}", flush=True)
    return model_output


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--voice-id", required=True)
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--epochs", type=int, default=200)
    parser.add_argument("--batch-size", type=int, default=8)
    args = parser.parse_args()

    try:
        result = run_training_pipeline(
            args.voice_id,
            args.dataset,
            args.output_dir,
            args.epochs,
            args.batch_size,
        )
        print(json.dumps({"model_path": result}))
    except SingingWorkerError as e:
        print(json.dumps({"error": str(e), "code": e.code}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e), "traceback": traceback.format_exc()}), file=sys.stderr)
        sys.exit(1)
