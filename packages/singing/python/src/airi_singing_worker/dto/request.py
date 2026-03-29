"""Request DTOs for the singing worker."""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class CoverRequest:
    """Request to run a cover pipeline."""

    input_path: str
    output_dir: str
    separator_backend: str = "melband"
    separator_model: str = "melband-roformer-kim-vocals"
    pitch_backend: str = "rmvpe"
    converter_backend: str = "rvc"
    voice_id: Optional[str] = None
    reference_path: Optional[str] = None
    f0_up_key: int = 0
    index_rate: float = 0.75
    protect: float = 0.33
    rms_mix_rate: float = 0.25
    # Seed-VC params
    diffusion_steps: int = 40
    f0_condition: bool = True
    auto_f0_adjust: bool = False
    semi_tone_shift: int = 0
    # Mix params
    vocal_gain_db: float = 0.0
    inst_gain_db: float = -1.5
    ducking: bool = True
    target_lufs: float = -14.0
    true_peak_db: float = -1.5
