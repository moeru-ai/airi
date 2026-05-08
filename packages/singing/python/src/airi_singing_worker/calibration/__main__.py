"""CLI entry point: python -m airi_singing_worker.calibration

Usage:
  python -m airi_singing_worker.calibration analyze --vocal VOCAL_PATH
  python -m airi_singing_worker.calibration predict --vocal VOCAL_PATH --voice-profile VP_PATH
  python -m airi_singing_worker.calibration validate --output OUTPUT --source SOURCE --voice-profile VP_PATH
  python -m airi_singing_worker.calibration adjust --params JSON --gate-result JSON --attempt N
  python -m airi_singing_worker.calibration profile --audio-dir DIR --voice-id ID --output OUT_PATH
"""

import argparse
import json
import sys

from .source_analyzer import analyze_source
from .param_predictor import predict_params, PredictedParams
from .validation_gate import run_validation_gate, GateResult
from .retry_strategy import adjust_params
from .voice_profile import build_voice_profile, save_voice_profile, load_voice_profile


def main():
    parser = argparse.ArgumentParser(
        prog="airi_singing_worker.calibration",
        description="Auto-calibration for singing voice conversion",
    )
    sub = parser.add_subparsers(dest="command")

    # Analyze source
    analyze_p = sub.add_parser("analyze", help="Analyze source vocal features")
    analyze_p.add_argument("--vocal", required=True, help="Separated vocal path")

    # Predict params
    predict_p = sub.add_parser("predict", help="Predict optimal RVC parameters")
    predict_p.add_argument("--vocal", required=True, help="Separated vocal path")
    predict_p.add_argument("--voice-profile", required=True, help="voice_profile.json path")

    # Validate output
    validate_p = sub.add_parser("validate", help="Post-inference validation gate")
    validate_p.add_argument("--output", required=True, help="Converted vocal path")
    validate_p.add_argument("--source", required=True, help="Original vocal path")
    validate_p.add_argument("--voice-profile", required=True, help="voice_profile.json path")

    # Adjust params for retry
    adjust_p = sub.add_parser("adjust", help="Adjust params based on gate failure")
    adjust_p.add_argument("--params", required=True, help="Current PredictedParams JSON string")
    adjust_p.add_argument("--gate-result", required=True, help="GateResult JSON string")
    adjust_p.add_argument("--attempt", type=int, required=True, help="Retry attempt number (1-based)")

    # Build profile
    profile_p = sub.add_parser("profile", help="Build voice profile from audio files")
    profile_p.add_argument("--audio-dir", required=True, help="Directory of training segments")
    profile_p.add_argument("--voice-id", default="unknown", help="Voice model identifier")
    profile_p.add_argument("--output", required=True, help="Output voice_profile.json path")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "analyze":
        feats = analyze_source(args.vocal)
        print(json.dumps(feats.to_dict(), indent=2))

    elif args.command == "predict":
        profile = load_voice_profile(args.voice_profile)
        feats = analyze_source(args.vocal)
        params = predict_params(feats, profile)
        print(json.dumps(params.to_dict(), indent=2))

    elif args.command == "validate":
        profile = load_voice_profile(args.voice_profile)
        result = run_validation_gate(args.output, args.source, profile)
        print(json.dumps(result.to_dict(), indent=2))

    elif args.command == "adjust":
        params_dict = json.loads(args.params)
        gate_dict = json.loads(args.gate_result)
        current = PredictedParams(**{
            k: v for k, v in params_dict.items()
            if k in PredictedParams.__dataclass_fields__
        })
        gate = GateResult(**{
            k: v for k, v in gate_dict.items()
            if k in GateResult.__dataclass_fields__
        })
        adjusted = adjust_params(current, gate, args.attempt)
        print(json.dumps(adjusted.to_dict(), indent=2))

    elif args.command == "profile":
        import glob
        audio_files = sorted(glob.glob(f"{args.audio_dir}/*.wav"))
        profile = build_voice_profile(audio_files, args.voice_id)
        save_voice_profile(profile, args.output)
        print(json.dumps(profile.to_dict(), indent=2))


if __name__ == "__main__":
    main()
