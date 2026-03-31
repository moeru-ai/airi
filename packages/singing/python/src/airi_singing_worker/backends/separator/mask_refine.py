"""Mask-guided stem reconstruction helpers for separator outputs.

These helpers intentionally reconstruct stems from the *mixture phase* using
soft masks instead of directly subtracting waveform estimates. In practice this
reduces phasey residuals, preserves continuity through harmony-overlap regions,
and keeps the stems energy-complementary.
"""

from __future__ import annotations

import numpy as np


def _as_channels(data: np.ndarray) -> tuple[np.ndarray, bool]:
    if data.ndim == 1:
        return data[:, None], True
    return data, False


def _restore_channels(data: np.ndarray, was_mono: bool) -> np.ndarray:
    if was_mono:
        return data[:, 0]
    return data


def _smooth_mask(mask: np.ndarray, freq_radius: int = 2, time_radius: int = 4) -> np.ndarray:
    if mask.size == 0:
        return mask

    time_kernel = np.ones((time_radius * 2) + 1, dtype=np.float32)
    time_kernel /= np.sum(time_kernel)
    freq_kernel = np.ones((freq_radius * 2) + 1, dtype=np.float32)
    freq_kernel /= np.sum(freq_kernel)

    smoothed = np.apply_along_axis(
        lambda row: np.convolve(row, time_kernel, mode="same"),
        1,
        mask,
    )
    smoothed = np.apply_along_axis(
        lambda col: np.convolve(col, freq_kernel, mode="same"),
        0,
        smoothed,
    )
    return smoothed.astype(np.float32, copy=False)


def reconstruct_stems_from_estimate(
    mixture: np.ndarray,
    target_estimate: np.ndarray,
    sr: int,
    *,
    alpha: float = 1.0,
    n_fft: int = 2048,
    hop_length: int = 512,
    min_mask: float = 0.02,
    max_mask: float = 0.98,
) -> tuple[np.ndarray, np.ndarray]:
    """Rebuild target and residual stems with a soft mask on the mixture phase.

    The generalized Wiener/soft-mask literature consistently shows that soft
    masks are less artifact-prone than hard waveform subtraction for source
    separation. We apply the separator estimate as a guide, then reconstruct
    both stems from the original mixture so they remain complementary.
    """
    import librosa

    mix_channels, was_mono = _as_channels(np.asarray(mixture, dtype=np.float32))
    est_channels, _ = _as_channels(np.asarray(target_estimate, dtype=np.float32))

    if mix_channels.shape[0] != est_channels.shape[0]:
        length = min(mix_channels.shape[0], est_channels.shape[0])
        mix_channels = mix_channels[:length]
        est_channels = est_channels[:length]

    n_channels = min(mix_channels.shape[1], est_channels.shape[1])
    mix_channels = mix_channels[:, :n_channels]
    est_channels = est_channels[:, :n_channels]

    refined_target = np.zeros_like(mix_channels)
    refined_residual = np.zeros_like(mix_channels)

    for channel_index in range(n_channels):
        mix = mix_channels[:, channel_index]
        estimate = est_channels[:, channel_index]

        mix_spec = librosa.stft(mix, n_fft=n_fft, hop_length=hop_length)
        est_spec = librosa.stft(estimate, n_fft=n_fft, hop_length=hop_length)

        mix_mag = np.abs(mix_spec)
        est_mag = np.minimum(np.abs(est_spec), mix_mag)
        residual_mag = np.maximum(mix_mag - est_mag, 0.0)

        numerator = np.power(est_mag, alpha)
        denominator = numerator + np.power(residual_mag, alpha) + 1e-8
        target_mask = np.clip(numerator / denominator, min_mask, max_mask)
        target_mask = _smooth_mask(target_mask)

        target_spec = mix_spec * target_mask
        residual_spec = mix_spec * (1.0 - target_mask)

        refined_target[:, channel_index] = librosa.istft(
            target_spec,
            hop_length=hop_length,
            length=len(mix),
        )
        refined_residual[:, channel_index] = librosa.istft(
            residual_spec,
            hop_length=hop_length,
            length=len(mix),
        )

    return _restore_channels(refined_target, was_mono), _restore_channels(refined_residual, was_mono)


def stabilize_lead_presence(
    lead: np.ndarray,
    mixture: np.ndarray,
    sr: int,
    *,
    min_presence_ratio: float = 0.38,
    silence_floor: float = 0.008,
    max_mix_blend: float = 0.60,
    window_ms: float = 40.0,
    hop_ms: float = 10.0,
) -> np.ndarray:
    """Blend back just enough mixture to prevent isolated-lead dropouts.

    Karaoke/lead-separation models often produce missing syllables when harmonies
    strongly overlap with the target singer. We treat the separator output as a
    guide rather than ground truth and enforce a minimum local presence ratio.
    """
    lead_channels, was_mono = _as_channels(np.asarray(lead, dtype=np.float32))
    mix_channels, _ = _as_channels(np.asarray(mixture, dtype=np.float32))

    length = min(lead_channels.shape[0], mix_channels.shape[0])
    lead_channels = lead_channels[:length]
    mix_channels = mix_channels[:length, :lead_channels.shape[1]]

    lead_mono = np.mean(np.abs(lead_channels), axis=1)
    mix_mono = np.mean(np.abs(mix_channels), axis=1)

    win = max(1, int(sr * (window_ms / 1000.0)))
    hop = max(1, int(sr * (hop_ms / 1000.0)))
    frame_count = max(1, ((length - win) // hop) + 1)

    blend_env = np.zeros(frame_count, dtype=np.float32)
    for index in range(frame_count):
        start = index * hop
        lead_frame = lead_mono[start:start + win]
        mix_frame = mix_mono[start:start + win]
        if len(lead_frame) == 0 or len(mix_frame) == 0:
            continue

        lead_rms = float(np.sqrt(np.mean(lead_frame ** 2)))
        mix_rms = float(np.sqrt(np.mean(mix_frame ** 2)))
        if mix_rms < silence_floor:
            continue

        presence_ratio = lead_rms / max(mix_rms, 1e-6)
        if presence_ratio < min_presence_ratio:
            required = (min_presence_ratio - presence_ratio) / max(min_presence_ratio, 1e-6)
            blend_env[index] = np.clip(required, 0.0, 1.0) * max_mix_blend

    if np.max(blend_env) <= 0:
        return _restore_channels(lead_channels, was_mono)

    sample_positions = np.arange(length, dtype=np.float32)
    frame_positions = np.arange(frame_count, dtype=np.float32) * hop
    sample_blend = np.interp(sample_positions, frame_positions, blend_env).astype(np.float32)

    blended = lead_channels + (sample_blend[:, None] * (mix_channels - lead_channels))
    peak = float(np.max(np.abs(blended))) if blended.size > 0 else 0.0
    if peak > 0.999:
        blended *= 0.999 / peak

    return _restore_channels(blended, was_mono)
