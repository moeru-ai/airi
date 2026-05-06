"""FFmpeg subprocess wrapper for the singing worker."""

import os
import subprocess
from typing import List, Optional


def _get_ffmpeg_bin() -> str:
    return os.environ.get("AIRI_SINGING_FFMPEG_PATH", "ffmpeg")


def run_ffmpeg(args: List[str], cwd: Optional[str] = None) -> subprocess.CompletedProcess:
    """Run an FFmpeg command and return the result."""
    cmd = [_get_ffmpeg_bin()] + args
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=True)
