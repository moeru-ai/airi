"""Vocal post-processing pipeline for AI Cover output.

Applies DSP chain to reduce electronic artifacts and improve naturalness:
  1. Noise Gate — suppress low-level noise in silent segments
  2. High-frequency augmentation — restore 6-16kHz from source vocals (SYKI-SVC)
  3. De-essing — compress sibilant energy in 2-8kHz band
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import soundfile as sf


def noise_gate(
    data: np.ndarray,
    sr: int,
    threshold_db: float = -40.0,
    attack_ms: float = 5.0,
    release_ms: float = 50.0,
) -> np.ndarray:
    """Apply noise gate: attenuate signal below RMS threshold.

    Uses smoothed envelope following to avoid click artifacts at gate transitions.
    """
    threshold_linear = 10.0 ** (threshold_db / 20.0)
    attack_samples = max(1, int(sr * attack_ms / 1000.0))
    release_samples = max(1, int(sr * release_ms / 1000.0))

    frame_len = int(sr * 0.01)  # 10ms analysis frames
    hop = frame_len // 2

    n_samples = len(data)
    gain = np.ones(n_samples, dtype=np.float32)

    for i in range(0, n_samples - frame_len, hop):
        frame = data[i:i + frame_len]
        rms = np.sqrt(np.mean(frame ** 2))
        if rms < threshold_linear:
            gain[i:i + frame_len] = np.minimum(
                gain[i:i + frame_len],
                rms / max(threshold_linear, 1e-10),
            )

    # Smooth gain envelope to prevent clicks
    alpha_attack = 1.0 - np.exp(-1.0 / attack_samples)
    alpha_release = 1.0 - np.exp(-1.0 / release_samples)

    smoothed = np.ones_like(gain)
    smoothed[0] = gain[0]
    for i in range(1, len(gain)):
        alpha = alpha_attack if gain[i] < smoothed[i - 1] else alpha_release
        smoothed[i] = alpha * gain[i] + (1.0 - alpha) * smoothed[i - 1]

    return data * smoothed


def high_freq_augment(
    converted: np.ndarray,
    source: np.ndarray,
    sr: int,
    low_cutoff_hz: float = 6000.0,
    high_cutoff_hz: float = 16000.0,
    mix_ratio: float = 0.35,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> np.ndarray:
    """Restore high-frequency content from source vocals (SYKI-SVC inspired).

    In STFT domain, blends high-frequency magnitude from source into converted output.
    Phase from converted is preserved to maintain temporal coherence.
    """
    min_len = min(len(converted), len(source))
    converted = converted[:min_len]
    source = source[:min_len]

    window = np.hanning(n_fft).astype(np.float32)
    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    hf_mask = (freq_bins >= low_cutoff_hz) & (freq_bins <= high_cutoff_hz)

    n_frames = (min_len - n_fft) // hop_length + 1
    output = np.zeros(min_len, dtype=np.float32)
    window_sum = np.zeros(min_len, dtype=np.float32)

    for i in range(n_frames):
        start = i * hop_length
        end = start + n_fft

        conv_frame = converted[start:end] * window
        src_frame = source[start:end] * window

        conv_fft = np.fft.rfft(conv_frame)
        src_fft = np.fft.rfft(src_frame)

        conv_mag = np.abs(conv_fft)
        conv_phase = np.angle(conv_fft)
        src_mag = np.abs(src_fft)

        blended_mag = conv_mag.copy()
        blended_mag[hf_mask] = (
            (1.0 - mix_ratio) * conv_mag[hf_mask]
            + mix_ratio * src_mag[hf_mask]
        )

        blended_fft = blended_mag * np.exp(1j * conv_phase)
        frame_out = np.fft.irfft(blended_fft, n=n_fft).astype(np.float32)

        output[start:end] += frame_out * window
        window_sum[start:end] += window ** 2

    # Normalize overlap-add
    nonzero = window_sum > 1e-8
    output[nonzero] /= window_sum[nonzero]
    output[~nonzero] = converted[~nonzero]

    return output


def deessing(
    data: np.ndarray,
    sr: int,
    low_hz: float = 2000.0,
    high_hz: float = 8000.0,
    threshold_db: float = -20.0,
    ratio: float = 4.0,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> np.ndarray:
    """Dynamic compression on sibilant frequency band (2-8kHz).

    Detects frames where sibilant energy exceeds threshold and
    reduces gain in that band proportionally.
    """
    threshold_linear = 10.0 ** (threshold_db / 20.0)
    window = np.hanning(n_fft).astype(np.float32)
    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    sib_mask = (freq_bins >= low_hz) & (freq_bins <= high_hz)

    n_frames = (len(data) - n_fft) // hop_length + 1
    output = np.zeros(len(data), dtype=np.float32)
    window_sum = np.zeros(len(data), dtype=np.float32)

    for i in range(n_frames):
        start = i * hop_length
        end = start + n_fft

        frame = data[start:end] * window
        fft = np.fft.rfft(frame)
        mag = np.abs(fft)
        phase = np.angle(fft)

        sib_energy = np.sqrt(np.mean(mag[sib_mask] ** 2))

        if sib_energy > threshold_linear:
            excess_db = 20.0 * np.log10(sib_energy / threshold_linear)
            reduction_db = excess_db * (1.0 - 1.0 / ratio)
            gain = 10.0 ** (-reduction_db / 20.0)
            mag[sib_mask] *= gain

        frame_out = np.fft.irfft(mag * np.exp(1j * phase), n=n_fft).astype(np.float32)
        output[start:end] += frame_out * window
        window_sum[start:end] += window ** 2

    nonzero = window_sum > 1e-8
    output[nonzero] /= window_sum[nonzero]
    output[~nonzero] = data[~nonzero]

    return output


def run_postprocess(
    converted_path: str,
    source_vocals_path: str,
    output_path: str,
    enable_noise_gate: bool = True,
    enable_hf_augment: bool = True,
    enable_deessing: bool = True,
    noise_gate_threshold_db: float = -40.0,
    hf_mix_ratio: float = 0.35,
    deessing_threshold_db: float = -20.0,
) -> str:
    """Run the full post-processing chain on converted vocals.

    Args:
        converted_path: Path to RVC-converted vocals.
        source_vocals_path: Path to original separated vocals (for HF reference).
        output_path: Path to write the post-processed output.

    Returns:
        Path to the post-processed audio file.
    """
    data, sr = sf.read(converted_path, dtype="float32")
    mono = data.mean(axis=1) if data.ndim > 1 else data

    if enable_noise_gate:
        mono = noise_gate(mono, sr, threshold_db=noise_gate_threshold_db)
        print("Post-process: noise gate applied", flush=True)

    if enable_hf_augment and os.path.exists(source_vocals_path):
        source_data, source_sr = sf.read(source_vocals_path, dtype="float32")
        source_mono = source_data.mean(axis=1) if source_data.ndim > 1 else source_data

        if source_sr != sr:
            import librosa
            source_mono = librosa.resample(source_mono, orig_sr=source_sr, target_sr=sr)

        mono = high_freq_augment(mono, source_mono, sr, mix_ratio=hf_mix_ratio)
        print("Post-process: HF augmentation applied", flush=True)

    if enable_deessing:
        mono = deessing(mono, sr, threshold_db=deessing_threshold_db)
        print("Post-process: de-essing applied", flush=True)

    # Prevent clipping
    peak = np.max(np.abs(mono))
    if peak > 0.99:
        mono = mono * (0.99 / peak)

    sf.write(output_path, mono, sr, subtype="PCM_16")
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
    parser.add_argument("--noise-gate-threshold", type=float, default=-40.0)
    parser.add_argument("--hf-mix-ratio", type=float, default=0.35)
    parser.add_argument("--deessing-threshold", type=float, default=-20.0)
    args = parser.parse_args()

    result = run_postprocess(
        converted_path=args.converted,
        source_vocals_path=args.source_vocals,
        output_path=args.output,
        enable_noise_gate=not args.no_noise_gate,
        enable_hf_augment=not args.no_hf_augment,
        enable_deessing=not args.no_deessing,
        noise_gate_threshold_db=args.noise_gate_threshold,
        hf_mix_ratio=args.hf_mix_ratio,
        deessing_threshold_db=args.deessing_threshold,
    )
    print(json.dumps({"output_path": result}))
