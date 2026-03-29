"""CLI entry point for the AIRI singing worker.

Supports two modes:
- --json-rpc '{"method":"...", "params":{...}}' : dispatch to a backend
- --health-check : print OK and exit 0
"""

import json
import sys

from .errors.base import SingingWorkerError


def main() -> None:
    """Main CLI entry point."""
    args = sys.argv[1:]

    if "--health-check" in args:
        print("OK")
        sys.exit(0)

    if "--json-rpc" in args:
        idx = args.index("--json-rpc")
        if idx + 1 >= len(args):
            print(json.dumps({"error": "Missing JSON-RPC argument"}))
            sys.exit(1)
        try:
            payload = json.loads(args[idx + 1])
            method = payload.get("method", "")
            params = payload.get("params", {})
            result = dispatch(method, params)
            print(json.dumps(result))
            sys.exit(0)
        except SingingWorkerError as e:
            print(json.dumps({"error": str(e), "code": e.code}))
            sys.exit(1)
        except Exception as e:
            print(json.dumps({"error": str(e)}))
            sys.exit(1)

    print("Usage: airi-singing --json-rpc '{...}' | --health-check")
    sys.exit(1)


def dispatch(method: str, params: dict) -> dict:
    """Dispatch a method call to the appropriate backend."""
    if method == "separate":
        backend = params.get("backend", "melband")
        if backend == "melband":
            from .backends.separator.melband_roformer import separate
            return separate(
                params["input_path"],
                params["output_dir"],
                params.get("model", "melband-roformer-kim-vocals"),
            )
        if backend == "bs_roformer":
            from .backends.separator.bs_roformer import separate
            return separate(
                params["input_path"],
                params["output_dir"],
                params.get("model", "BS-RoFormer-SW"),
            )
        raise SingingWorkerError(
            f"Unknown separator backend: {backend}",
            code="UNKNOWN_BACKEND",
        )

    if method == "pitch":
        from .backends.pitch.rmvpe import extract_f0
        return {"f0_path": extract_f0(params["input_path"], params["output_dir"])}

    if method == "convert":
        backend = params.get("backend", "rvc")
        if backend == "rvc":
            from .backends.converter.rvc import convert
            return {"output_path": convert(**params)}
        if backend == "seedvc":
            from .backends.converter.seed_vc import convert
            return {"output_path": convert(**params)}
        raise SingingWorkerError(
            f"Unknown converter backend: {backend}",
            code="UNKNOWN_BACKEND",
        )

    if method == "mix":
        from .backends.mix.ffmpeg_mix import remix
        return {"output_path": remix(**params)}

    raise SingingWorkerError(f"Unknown method: {method}", code="UNKNOWN_METHOD")


if __name__ == "__main__":
    main()
