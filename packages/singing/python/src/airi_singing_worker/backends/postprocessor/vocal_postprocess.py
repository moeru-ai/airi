"""Vocal post-processing pipeline for AI Cover output.

Applies a single-pass STFT DSP chain to reduce common RVC artifacts:
  1. Noise gate (time-domain, before STFT)
  2. Spectral denoise focused on broadband/high-frequency buzz
  3. HF balance: clamp excessive synthetic HF + restore missing HF detail
  4. De-essing on harsh 2-8kHz sibilance

All spectral operations are performed in a single STFT/ISTFT pass to
minimize phase distortion and quantization error accumulation.
"""

from __future__ import annotations

import json
import os

import numpy as np
import soundfile as sf


def _trim_pair(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    min_len = min(len(a), len(b))
    return a[:min_len], b[:min_len]


def noise_gate(
    data: np.ndarray,
    sr: int,
    threshold_db: float = -54.0,
    attack_ms: float = 5.0,
    release_ms: float = 50.0,
) -> np.ndarray:
    """Apply noise gate: attenuate signal below RMS threshold."""
    threshold_linear = 10.0 ** (threshold_db / 20.0)
    attack_samples = max(1, int(sr * attack_ms / 1000.0))
    release_samples = max(1, int(sr * release_ms / 1000.0))

    frame_len = int(sr * 0.01)
    hop = max(frame_len // 2, 1)

    n_samples = len(data)
    gain = np.ones(n_samples, dtype=np.float32)

    for i in range(0, max(n_samples - frame_len, 1), hop):
        frame = data[i:i + frame_len]
        if len(frame) == 0:
            continue
        rms = np.sqrt(np.mean(frame ** 2))
        if rms < threshold_linear:
            gain[i:i + frame_len] = np.minimum(
                gain[i:i + frame_len],
                rms / max(threshold_linear, 1e-10),
            )

    alpha_attack = 1.0 - np.exp(-1.0 / attack_samples)
    alpha_release = 1.0 - np.exp(-1.0 / release_samples)

    smoothed = np.ones_like(gain)
    smoothed[0] = gain[0]
    for i in range(1, len(gain)):
        alpha = alpha_attack if gain[i] < smoothed[i - 1] else alpha_release
        smoothed[i] = alpha * gain[i] + (1.0 - alpha) * smoothed[i - 1]

    return data * smoothed


def _apply_spectral_denoise(
    conv_mag: np.ndarray,
    sr: int,
    n_fft: int,
    strength: float = 0.35,
    noise_percentile: float = 0.08,
    focus_low_hz: float = 3500.0,
    focus_high_hz: float = 14000.0,
) -> np.ndarray:
    """Spectral subtraction on magnitude, operating in-place on the single-pass spectrum.

    Uses the lowest-energy frames to estimate a noise floor, then subtracts a
    fraction of it weighted more heavily in the HF focus band.
    """
    frame_energy = np.mean(conv_mag, axis=0)

    n_noise_frames = max(1, int(conv_mag.shape[1] * noise_percentile))
    noise_frame_indices = np.argsort(frame_energy)[:n_noise_frames]
    noise_profile = np.percentile(conv_mag[:, noise_frame_indices], 75, axis=1)

    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    freq_weight = np.full_like(freq_bins, 0.35, dtype=np.float32)
    focus_mask = (freq_bins >= focus_low_hz) & (freq_bins <= min(focus_high_hz, sr / 2))
    if np.any(focus_mask):
        freq_weight[focus_mask] = np.linspace(1.0, 1.15, int(np.sum(focus_mask)), dtype=np.float32)
    freq_weight[freq_bins > focus_high_hz] = 1.15

    return np.maximum(conv_mag - (strength * noise_profile[:, None] * freq_weight[:, None]), 0.0)


def spectral_denoise(
    data: np.ndarray,
    sr: int,
    strength: float = 0.35,
    noise_percentile: float = 0.08,
    focus_low_hz: float = 3500.0,
    focus_high_hz: float = 14000.0,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> np.ndarray:
    """Public convenience wrapper: spectral denoise on a time-domain signal."""
    import librosa

    spec = librosa.stft(data, n_fft=n_fft, hop_length=hop_length)
    mag = np.abs(spec)
    phase = np.angle(spec)

    cleaned_mag = _apply_spectral_denoise(mag, sr, n_fft, strength, noise_percentile, focus_low_hz, focus_high_hz)
    cleaned_spec = cleaned_mag * np.exp(1j * phase)
    return librosa.istft(cleaned_spec, hop_length=hop_length, length=len(data))


def _apply_hf_balance(
    conv_mag: np.ndarray,
    src_mag: np.ndarray,
    sr: int,
    n_fft: int,
    low_cutoff_hz: float = 4500.0,
    high_cutoff_hz: float = 16000.0,
    max_ratio: float = 1.5,
    restore_cutoff_hz: float = 6000.0,
    restore_mix_ratio: float = 0.10,
) -> np.ndarray:
    """Unified HF balance: clamp excessive HF + restore missing HF in one pass.

    For the 4.5-16kHz band: cap converted energy at source * max_ratio.
    For the 6-16kHz sub-band: fill in missing energy from source at mix_ratio.
    """
    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)

    # Step 1: Clamp excessive HF (4.5-16kHz)
    clamp_mask = (freq_bins >= low_cutoff_hz) & (freq_bins <= min(high_cutoff_hz, sr / 2))
    if np.any(clamp_mask):
        n_frames = min(conv_mag.shape[1], src_mag.shape[1])
        baseline = np.percentile(conv_mag[clamp_mask, :n_frames], 25, axis=1, keepdims=True)
        allowed = np.maximum(src_mag[clamp_mask, :n_frames] * max_ratio, baseline)
        conv_mag[clamp_mask, :n_frames] = np.minimum(conv_mag[clamp_mask, :n_frames], allowed)

    # Step 2: Restore missing HF (6-16kHz)
    restore_mask = (freq_bins >= restore_cutoff_hz) & (freq_bins <= min(high_cutoff_hz, sr / 2))
    if np.any(restore_mask):
        n_frames = min(conv_mag.shape[1], src_mag.shape[1])
        missing_hf = np.maximum(src_mag[restore_mask, :n_frames] - conv_mag[restore_mask, :n_frames], 0.0)
        conv_mag[restore_mask, :n_frames] += restore_mix_ratio * missing_hf

    return conv_mag


def _apply_deessing(
    conv_mag: np.ndarray,
    sr: int,
    n_fft: int,
    low_hz: float = 2000.0,
    high_hz: float = 8000.0,
    threshold_db: float = -14.0,
    ratio: float = 4.0,
) -> np.ndarray:
    """Dynamic compression on the sibilant band, operating on magnitude in-place."""
    threshold_linear = 10.0 ** (threshold_db / 20.0)
    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    sib_mask = (freq_bins >= low_hz) & (freq_bins <= min(high_hz, sr / 2))

    for frame_index in range(conv_mag.shape[1]):
        sib_energy = np.sqrt(np.mean(conv_mag[sib_mask, frame_index] ** 2))
        if sib_energy <= threshold_linear:
            continue
        excess_db = 20.0 * np.log10(sib_energy / threshold_linear)
        reduction_db = excess_db * (1.0 - 1.0 / ratio)
        gain = 10.0 ** (-reduction_db / 20.0)
        conv_mag[sib_mask, frame_index] *= gain

    return conv_mag


def run_postprocess(
    converted_path: str,
    source_vocals_path: str,
    output_path: str,
    enable_noise_gate: bool = True,
    enable_hf_augment: bool = True,
    enable_deessing: bool = True,
    noise_gate_threshold_db: float = -54.0,
    spectral_denoise_strength: float = 0.35,
    hf_max_ratio: float = 1.5,
    hf_mix_ratio: float = 0.10,
    deessing_threshold_db: float = -14.0,
) -> str:
    """Run the full post-processing chain on converted vocals.

    Uses a single STFT/ISTFT pass for all spectral operations to minimize
    phase distortion and quantization error accumulation.
    """
    import librosa

    data, sr = sf.read(converted_path, dtype="float32")
    mono = data.mean(axis=1) if data.ndim > 1 else data

    source_mono: np.ndarray | None = None
    if os.path.exists(source_vocals_path):
        source_data, source_sr = sf.read(source_vocals_path, dtype="float32")
        source_mono = source_data.mean(axis=1) if source_data.ndim > 1 else source_data

        if source_sr != sr:
            source_mono = librosa.resample(source_mono, orig_sr=source_sr, target_sr=sr)

    if enable_noise_gate:
        mono = noise_gate(mono, sr, threshold_db=noise_gate_threshold_db)
        print("Post-process: noise gate applied", flush=True)

    n_fft = 2048
    hop_length = 512

    conv_spec = librosa.stft(mono, n_fft=n_fft, hop_length=hop_length)
    conv_mag = np.abs(conv_spec)
    conv_phase = np.angle(conv_spec)

    src_mag: np.ndarray | None = None
    if source_mono is not None:
        trimmed_mono, trimmed_source = _trim_pair(mono, source_mono)
        src_spec = librosa.stft(trimmed_source, n_fft=n_fft, hop_length=hop_length)
        src_mag = np.abs(src_spec)

    conv_mag = _apply_spectral_denoise(conv_mag, sr, n_fft, strength=spectral_denoise_strength)
    print("Post-process: spectral denoise applied", flush=True)

    if src_mag is not None:
        conv_mag = _apply_hf_balance(
            conv_mag, src_mag, sr, n_fft,
            max_ratio=hf_max_ratio,
            restore_mix_ratio=hf_mix_ratio if enable_hf_augment else 0.0,
        )
        print("Post-process: HF balance applied", flush=True)

    if enable_deessing:
        conv_mag = _apply_deessing(conv_mag, sr, n_fft, threshold_db=deessing_threshold_db)
        print("Post-process: de-essing applied", flush=True)

    processed_spec = conv_mag * np.exp(1j * conv_phase)
    result = librosa.istft(processed_spec, hop_length=hop_length, length=len(mono))

    peak = np.max(np.abs(result)) if len(result) > 0 else 0.0
    if peak > 0.99:
        result = result * (0.99 / peak)

    sf.write(output_path, result, sr, subtype="FLOAT")
    return output_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Vocal post-processing")
    parser.add_argument("--converted", required=True, help="Path to converted vocals")
    parser.add_argument("--source-vocals", required=True, help="Path to source vocals")
    parser.add_argument("--output", required=True, help="Output path")
    parser.add_argument("--no-noise-gate", action="store_true")
    parser.add_argument("--no-hf-augment", action="store_true")
    parser.add_argument("--no-deessing", action="store_true")
    parser.add_argument("--noise-gate-threshold", type=float, default=-54.0)
    parser.add_argument("--spectral-denoise-strength", type=float, default=0.35)
    parser.add_argument("--hf-max-ratio", type=float, default=1.5)
    parser.add_argument("--hf-mix-ratio", type=float, default=0.10)
    parser.add_argument("--deessing-threshold", type=float, default=-14.0)
    args = parser.parse_args()

    result = run_postprocess(
        converted_path=args.converted,
        source_vocals_path=args.source_vocals,
        output_path=args.output,
        enable_noise_gate=not args.no_noise_gate,
        enable_hf_augment=not args.no_hf_augment,
        enable_deessing=not args.no_deessing,
        noise_gate_threshold_db=args.noise_gate_threshold,
        spectral_denoise_strength=args.spectral_denoise_strength,
        hf_max_ratio=args.hf_max_ratio,
        hf_mix_ratio=args.hf_mix_ratio,
        deessing_threshold_db=args.deessing_threshold,
    )
    print(json.dumps({"output_path": result}))
