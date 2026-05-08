"""Auto-calibration for singing voice conversion inference.

Provides:
  - VoiceProfile: per-model audio characteristics
  - SourceFeatures: per-song input analysis
  - PredictedParams: auto-tuned RVC parameters
  - ValidationGate: post-inference quality check
  - RetryStrategy: parameter adjustment for re-runs
"""

from .voice_profile import VoiceProfile, build_voice_profile, save_voice_profile, load_voice_profile
from .source_analyzer import SourceFeatures, analyze_source
from .param_predictor import PredictedParams, predict_params
from .validation_gate import GateResult, run_validation_gate
from .retry_strategy import adjust_params

__all__ = [
    "VoiceProfile",
    "build_voice_profile",
    "save_voice_profile",
    "load_voice_profile",
    "SourceFeatures",
    "analyze_source",
    "PredictedParams",
    "predict_params",
    "GateResult",
    "run_validation_gate",
    "adjust_params",
]
