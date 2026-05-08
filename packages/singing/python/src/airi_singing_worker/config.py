"""Runtime configuration for the singing worker."""

from dataclasses import dataclass, field
from pathlib import Path


def auto_detect_device() -> str:
    """Detect the best available compute device.
    
    Priority: CUDA > MPS (macOS) > CPU.
    Requires torch to be installed for GPU detection.
    """
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"


@dataclass
class WorkerConfig:
    """Configuration for the singing worker runtime."""

    models_dir: Path = field(default_factory=lambda: Path("models"))
    temp_dir: Path = field(default_factory=lambda: Path("temp"))
    ffmpeg_path: str = "ffmpeg"
    device: str = field(default_factory=auto_detect_device)
    log_level: str = "INFO"
