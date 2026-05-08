"""Preset registry: named parameter configurations."""

from typing import Any, Dict, Optional

_presets: Dict[str, Dict[str, Any]] = {
    "default": {
        "separator_backend": "melband",
        "separator_model": "melband-roformer-kim-vocals",
        "pitch_backend": "rmvpe",
        "vocal_gain_db": 0.0,
        "inst_gain_db": -1.5,
        "ducking": True,
        "target_lufs": -14.0,
        "true_peak_db": -1.5,
    },
}


def get_preset(name: str) -> Optional[Dict[str, Any]]:
    """Get a named preset configuration."""
    return _presets.get(name)


def list_presets() -> list:
    """List all available preset names."""
    return list(_presets.keys())
