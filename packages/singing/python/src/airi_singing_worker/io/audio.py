"""Audio file I/O utilities."""

from pathlib import Path

from ..errors.base import SingingWorkerError


def load_audio(path: str, sr: int = 44100) -> tuple:
    """Load an audio file and return (waveform, sample_rate).

    Tries librosa first, falls back to soundfile.
    """
    try:
        import librosa

        waveform, sample_rate = librosa.load(path, sr=sr, mono=False)
        return waveform, sample_rate
    except ImportError:
        pass

    try:
        import soundfile as sf
        import numpy as np

        waveform, native_sr = sf.read(path)
        if sr != native_sr and native_sr > 0:
            ratio = sr / native_sr
            if waveform.ndim == 1:
                new_len = int(len(waveform) * ratio)
                waveform = np.interp(
                    np.linspace(0, len(waveform) - 1, new_len),
                    np.arange(len(waveform)),
                    waveform,
                ).astype(waveform.dtype)
            else:
                new_len = int(waveform.shape[0] * ratio)
                resampled = np.empty((new_len, waveform.shape[1]), dtype=waveform.dtype)
                old_x = np.arange(waveform.shape[0])
                new_x = np.linspace(0, waveform.shape[0] - 1, new_len)
                for ch in range(waveform.shape[1]):
                    resampled[:, ch] = np.interp(new_x, old_x, waveform[:, ch])
                waveform = resampled
            native_sr = sr
        return waveform, native_sr
    except ImportError:
        pass

    raise SingingWorkerError(
        "No audio loading library available. Install librosa or soundfile: "
        "pip install librosa soundfile",
        code="MISSING_DEPENDENCY",
    )


def save_audio(path: str, waveform, sr: int = 44100) -> None:
    """Save a waveform to an audio file."""
    try:
        import soundfile as sf

        Path(path).parent.mkdir(parents=True, exist_ok=True)
        sf.write(path, waveform, sr)
        return
    except ImportError:
        pass

    raise SingingWorkerError(
        "No audio saving library available. Install soundfile: pip install soundfile",
        code="MISSING_DEPENDENCY",
    )
