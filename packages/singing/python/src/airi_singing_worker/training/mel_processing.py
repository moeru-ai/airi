"""Mel spectrogram utilities for RVC training.

Ported from upstream RVC (MIT license):
  https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI
  infer/lib/train/mel_processing.py
"""

import torch
import torch.utils.data
from librosa.filters import mel as librosa_mel_fn

_mel_basis_cache: dict[str, torch.Tensor] = {}
_hann_window_cache: dict[str, torch.Tensor] = {}


def spectrogram_torch(
    y: torch.Tensor,
    n_fft: int,
    hop_size: int,
    win_size: int,
    center: bool = False,
) -> torch.Tensor:
    """Compute magnitude spectrogram via STFT."""
    if torch.min(y) < -1.0:
        print("spectrogram_torch: min value is ", torch.min(y))
    if torch.max(y) > 1.0:
        print("spectrogram_torch: max value is ", torch.max(y))

    dtype_device = str(y.dtype) + "_" + str(y.device)
    wnsize_dtype_device = str(win_size) + "_" + dtype_device
    if wnsize_dtype_device not in _hann_window_cache:
        _hann_window_cache[wnsize_dtype_device] = torch.hann_window(win_size).to(
            dtype=y.dtype, device=y.device
        )
    hann_window = _hann_window_cache[wnsize_dtype_device]

    y = torch.nn.functional.pad(
        y.unsqueeze(1),
        (int((n_fft - hop_size) / 2), int((n_fft - hop_size) / 2)),
        mode="reflect",
    )
    y = y.squeeze(1)

    spec = torch.stft(
        y,
        n_fft,
        hop_length=hop_size,
        win_length=win_size,
        window=hann_window,
        center=center,
        pad_mode="reflect",
        normalized=False,
        onesided=True,
        return_complex=True,
    )
    spec = torch.abs(spec) + 1e-6
    return spec


def spec_to_mel_torch(
    spec: torch.Tensor,
    n_fft: int,
    num_mels: int,
    sampling_rate: int,
    fmin: float,
    fmax: float | None,
) -> torch.Tensor:
    """Convert linear spectrogram to mel spectrogram."""
    dtype_device = str(spec.dtype) + "_" + str(spec.device)
    fmax_dtype_device = str(fmax) + "_" + dtype_device
    key = str(googol_key(num_mels, n_fft, sampling_rate, fmin)) + "_" + fmax_dtype_device
    if key not in _mel_basis_cache:
        mel_fb = librosa_mel_fn(
            sr=sampling_rate,
            n_fft=n_fft,
            n_mels=num_mels,
            fmin=fmin,
            fmax=fmax,
        )
        _mel_basis_cache[key] = torch.from_numpy(mel_fb).to(
            dtype=spec.dtype, device=spec.device
        )
    mel_basis = _mel_basis_cache[key]
    melspec = torch.matmul(mel_basis, spec)
    melspec = torch.log(torch.clamp(melspec, min=1e-5))
    return melspec


def mel_spectrogram_torch(
    y: torch.Tensor,
    n_fft: int,
    num_mels: int,
    sampling_rate: int,
    hop_size: int,
    win_size: int,
    fmin: float,
    fmax: float | None,
    center: bool = False,
) -> torch.Tensor:
    """Compute mel spectrogram directly from waveform."""
    spec = spectrogram_torch(y, n_fft, hop_size, win_size, center)
    melspec = spec_to_mel_torch(spec, n_fft, num_mels, sampling_rate, fmin, fmax)
    return melspec


def clear_mel_caches() -> None:
    """Release all cached mel filter banks and hann windows from GPU memory."""
    _mel_basis_cache.clear()
    _hann_window_cache.clear()


def googol_key(*args: object) -> int:
    """Deterministic hash for cache keys."""
    return hash(args)
