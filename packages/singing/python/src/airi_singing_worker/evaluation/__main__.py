"""CLI entry point: python -m airi_singing_worker.evaluation

Usage:
  python -m airi_singing_worker.evaluation evaluate --ref REF --synth SYNTH [--voice-profile VP]
  python -m airi_singing_worker.evaluation batch --pairs PAIRS_JSON [--voice-profile VP]
"""

import argparse
import json
import sys

from .composite import run_evaluation, run_evaluation_batch


def main():
    parser = argparse.ArgumentParser(
        prog="airi_singing_worker.evaluation",
        description="4-axis evaluation for singing voice conversion",
    )
    sub = parser.add_subparsers(dest="command")

    # Single pair evaluation
    eval_p = sub.add_parser("evaluate", help="Evaluate a single ref/synth pair")
    eval_p.add_argument("--ref", required=True, help="Reference audio path")
    eval_p.add_argument("--synth", required=True, help="Synthesized audio path")
    eval_p.add_argument("--voice-profile", help="Path to voice_profile.json")
    eval_p.add_argument("--voice-id", default="unknown", help="Voice model identifier")

    # Batch evaluation
    batch_p = sub.add_parser("batch", help="Evaluate multiple pairs")
    batch_p.add_argument("--pairs", required=True, help="JSON file with [(ref, synth, tag), ...]")
    batch_p.add_argument("--voice-profile", help="Path to voice_profile.json")
    batch_p.add_argument("--voice-id", default="unknown", help="Voice model identifier")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    vp_data = None
    if args.voice_profile:
        with open(args.voice_profile) as f:
            vp_data = json.load(f)

    if args.command == "evaluate":
        card = run_evaluation(args.ref, args.synth, vp_data, args.voice_id)
        print(card.to_json())

    elif args.command == "batch":
        with open(args.pairs) as f:
            pairs = json.load(f)
        card = run_evaluation_batch(pairs, vp_data, args.voice_id)
        print(card.to_json())


if __name__ == "__main__":
    main()
