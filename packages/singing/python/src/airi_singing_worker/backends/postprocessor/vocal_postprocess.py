"""Vocal post-processing pipeline for AI Cover output.

Applies a lightweight but more robust DSP chain to reduce common RVC artifacts:
  1. Noise gate for low-level idle noise
  2. Spectral denoise focused on broadband/high-frequency buzz
  3. Source-guided HF cleanup to cap synthetic HF tearing above the source reference
  4. Missing-HF restoration from the source (SYKI-SVC inspired, but conservative)
  5. De-essing on harsh 2-8kHz sibilance

The chain deliberately prefers source-guided cleanup before restoration so we
do not re-inject the same "electric current" texture that users reported.
"""

from __future__ import annotations

import json
import os

import numpy as np
import soundfile as sf


def _stft(signal: np.ndarray, n_fft: int, hop_length: int) -> tuple[np.ndarray, np.ndarray, list[int], int]:
    """Compute a simple overlap-add STFT without extra heavy dependencies."""
    if len(signal) == 0:
        return np.zeros((n_fft // 2 + 1, 1), dtype=np.complex64), np.hanning(n_fft).astype(np.float32), [0], 0

    window = np.hanning(n_fft).astype(np.float32)
    frame_starts = list(range(0, max(len(signal) - n_fft, 0) + 1, hop_length))
    if not frame_starts:
        frame_starts = [0]
    elif frame_starts[-1] + n_fft < len(signal):
        frame_starts.append(len(signal) - n_fft)

    spec = np.zeros((n_fft // 2 + 1, len(frame_starts)), dtype=np.complex64)
    for frame_index, start in enumerate(frame_starts):
        frame = np.zeros(n_fft, dtype=np.float32)
        chunk = signal[start:start + n_fft]
        frame[:len(chunk)] = chunk
        spec[:, frame_index] = np.fft.rfft(frame * window)

    return spec, window, frame_starts, len(signal)


def _istft(spec: np.ndarray, window: np.ndarray, frame_starts: list[int], output_length: int, n_fft: int) -> np.ndarray:
    """Reconstruct a waveform from `_stft` output."""
    if output_length <= 0:
        return np.zeros(0, dtype=np.float32)

    output = np.zeros(output_length + n_fft, dtype=np.float32)
    window_sum = np.zeros(output_length + n_fft, dtype=np.float32)

    for frame_index, start in enumerate(frame_starts):
        frame = np.fft.irfft(spec[:, frame_index], n=n_fft).astype(np.float32)
        output[start:start + n_fft] += frame * window
        window_sum[start:start + n_fft] += window ** 2

    nonzero = window_sum > 1e-8
    output[nonzero] /= window_sum[nonzero]
    return output[:output_length]


def _trim_pair(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    min_len = min(len(a), len(b))
    return a[:min_len], b[:min_len]


def noise_gate(
    data: np.ndarray,
    sr: int,
    threshold_db: float = -42.0,
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


def spectral_denoise(
    data: np.ndarray,
    sr: int,
    strength: float = 1.2,
    noise_percentile: float = 0.15,
    focus_low_hz: float = 2500.0,
    focus_high_hz: float = 16000.0,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> np.ndarray:
    """Apply simple spectral subtraction with stronger attenuation in the noisy HF band.

    This is intentionally lightweight: it borrows the "estimate a noise floor
    from low-energy frames and suppress it in STFT space" idea used in classic
    enhancement pipelines and modern DNS baselines, but avoids introducing a
    large new dependency just for post-processing.
    """
    spec, window, frame_starts, output_length = _stft(data, n_fft, hop_length)
    mag = np.abs(spec)
    phase = np.angle(spec)
    frame_energy = np.mean(mag, axis=0)

    n_noise_frames = max(1, int(len(frame_energy) * noise_percentile))
    noise_frame_indices = np.argsort(frame_energy)[:n_noise_frames]
    noise_profile = np.percentile(mag[:, noise_frame_indices], 75, axis=1)

    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    freq_weight = np.full_like(freq_bins, 0.35, dtype=np.float32)
    focus_mask = (freq_bins >= focus_low_hz) & (freq_bins <= min(focus_high_hz, sr / 2))
    if np.any(focus_mask):
        focus_span = np.linspace(1.0, 1.45, int(np.sum(focus_mask)), dtype=np.float32)
        freq_weight[focus_mask] = focus_span
    freq_weight[freq_bins > focus_high_hz] = 1.45

    cleaned_mag = np.maximum(mag - (strength * noise_profile[:, None] * freq_weight[:, None]), 0.0)
    cleaned_spec = cleaned_mag * np.exp(1j * phase)
    return _istft(cleaned_spec, window, frame_starts, output_length, n_fft)


def source_guided_hf_cleanup(
    converted: np.ndarray,
    source: np.ndarray,
    sr: int,
    low_cutoff_hz: float = 4500.0,
    high_cutoff_hz: float = 16000.0,
    max_ratio: float = 1.18,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> np.ndarray:
    """Clamp excessive synthetic HF energy relative to the separated source vocal."""
    converted, source = _trim_pair(converted, source)

    conv_spec, window, frame_starts, output_length = _stft(converted, n_fft, hop_length)
    src_spec, _, _, _ = _stft(source, n_fft, hop_length)

    n_frames = min(conv_spec.shape[1], src_spec.shape[1])
    conv_spec = conv_spec[:, :n_frames]
    src_spec = src_spec[:, :n_frames]
    frame_starts = frame_starts[:n_frames]

    conv_mag = np.abs(conv_spec)
    src_mag = np.abs(src_spec)
    phase = np.angle(conv_spec)

    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    hf_mask = (freq_bins >= low_cutoff_hz) & (freq_bins <= min(high_cutoff_hz, sr / 2))
    if not np.any(hf_mask):
        return converted

    baseline = np.percentile(conv_mag[hf_mask], 25, axis=1, keepdims=True)
    allowed = np.maximum(src_mag[hf_mask] * max_ratio, baseline)
    conv_mag[hf_mask] = np.minimum(conv_mag[hf_mask], allowed)

    cleaned_spec = conv_mag * np.exp(1j * phase)
    return _istft(cleaned_spec, window, frame_starts, output_length, n_fft)


def high_freq_augment(
    converted: np.ndarray,
    source: np.ndarray,
    sr: int,
    low_cutoff_hz: float = 6000.0,
    high_cutoff_hz: float = 16000.0,
    mix_ratio: float = 0.18,
    n_fft: int = 2048,
    hop_length: int = 512,
) -> np.ndarray:
    """Restore only *missing* high-frequency detail from the source vocals.

    SYKI-SVC reports that source-guided high-frequency restoration improves
    naturalness. The important implementation detail here is that we only add
    source energy where the converted vocal is lacking it, instead of averaging
    all source HF content back in and reintroducing hiss/bleed.
    """
    converted, source = _trim_pair(converted, source)

    conv_spec, window, frame_starts, output_length = _stft(converted, n_fft, hop_length)
    src_spec, _, _, _ = _stft(source, n_fft, hop_length)

    n_frames = min(conv_spec.shape[1], src_spec.shape[1])
    conv_spec = conv_spec[:, :n_frames]
    src_spec = src_spec[:, :n_frames]
    frame_starts = frame_starts[:n_frames]

    conv_mag = np.abs(conv_spec)
    conv_phase = np.angle(conv_spec)
    src_mag = np.abs(src_spec)

    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    hf_mask = (freq_bins >= low_cutoff_hz) & (freq_bins <= min(high_cutoff_hz, sr / 2))
    if not np.any(hf_mask):
        return converted

    missing_hf = np.maximum(src_mag[hf_mask] - conv_mag[hf_mask], 0.0)
    conv_mag[hf_mask] = conv_mag[hf_mask] + (mix_ratio * missing_hf)

    blended_spec = conv_mag * np.exp(1j * conv_phase)
    return _istft(blended_spec, window, frame_starts, output_length, n_fft)


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
    """Dynamic compression on the 2-8kHz sibilant band."""
    threshold_linear = 10.0 ** (threshold_db / 20.0)
    spec, window, frame_starts, output_length = _stft(data, n_fft, hop_length)
    mag = np.abs(spec)
    phase = np.angle(spec)

    freq_bins = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    sib_mask = (freq_bins >= low_hz) & (freq_bins <= min(high_hz, sr / 2))

    for frame_index in range(mag.shape[1]):
        sib_energy = np.sqrt(np.mean(mag[sib_mask, frame_index] ** 2))
        if sib_energy <= threshold_linear:
            continue

        excess_db = 20.0 * np.log10(sib_energy / threshold_linear)
        reduction_db = excess_db * (1.0 - 1.0 / ratio)
        gain = 10.0 ** (-reduction_db / 20.0)
        mag[sib_mask, frame_index] *= gain

    processed_spec = mag * np.exp(1j * phase)
    return _istft(processed_spec, window, frame_starts, output_length, n_fft)


def run_postprocess(
    converted_path: str,
    source_vocals_path: str,
    output_path: str,
    enable_noise_gate: bool = True,
    enable_hf_augment: bool = True,
    enable_deessing: bool = True,
    noise_gate_threshold_db: float = -42.0,
    spectral_denoise_strength: float = 1.2,
    hf_mix_ratio: float = 0.18,
    deessing_threshold_db: float = -20.0,
) -> str:
    """Run the full post-processing chain on converted vocals."""
    data, sr = sf.read(converted_path, dtype="float32")
    mono = data.mean(axis=1) if data.ndim > 1 else data

    source_mono: np.ndarray | None = None
    if os.path.exists(source_vocals_path):
        source_data, source_sr = sf.read(source_vocals_path, dtype="float32")
        source_mono = source_data.mean(axis=1) if source_data.ndim > 1 else source_data

        if source_sr != sr:
            import librosa

            source_mono = librosa.resample(source_mono, orig_sr=source_sr, target_sr=sr)

    if enable_noise_gate:
        mono = noise_gate(mono, sr, threshold_db=noise_gate_threshold_db)
        print("Post-process: noise gate applied", flush=True)

    mono = spectral_denoise(mono, sr, strength=spectral_denoise_strength)
    print("Post-process: spectral denoise applied", flush=True)

    if source_mono is not None:
        mono = source_guided_hf_cleanup(mono, source_mono, sr)
        print("Post-process: source-guided HF cleanup applied", flush=True)

    if enable_hf_augment and source_mono is not None:
        mono = high_freq_augment(mono, source_mono, sr, mix_ratio=hf_mix_ratio)
        print("Post-process: HF augmentation applied", flush=True)

    if enable_deessing:
        mono = deessing(mono, sr, threshold_db=deessing_threshold_db)
        print("Post-process: de-essing applied", flush=True)

    peak = np.max(np.abs(mono)) if len(mono) > 0 else 0.0
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
    parser.add_argument("--noise-gate-threshold", type=float, default=-42.0)
    parser.add_argument("--spectral-denoise-strength", type=float, default=1.2)
    parser.add_argument("--hf-mix-ratio", type=float, default=0.18)
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
        spectral_denoise_strength=args.spectral_denoise_strength,
        hf_mix_ratio=args.hf_mix_ratio,
        deessing_threshold_db=args.deessing_threshold,
    )
    print(json.dumps({"output_path": result}))
