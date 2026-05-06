"""File system utilities for the singing worker."""

from pathlib import Path


def ensure_dir(path: str | Path) -> Path:
    """Create a directory if it does not exist, return the Path."""
    p = Path(path)
    p.mkdir(parents=True, exist_ok=True)
    return p
