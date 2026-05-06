"""Cover pipeline: standalone Python-side singing voice conversion.

This is the **standalone 4-stage pipeline** that runs entirely within Python:
  1. Separate vocals (MelBand/BS-RoFormer)
  2. Extract F0 (RMVPE)
  3. Convert vocals (RVC/Seed-VC)
  4. Remix (FFmpeg)

The full 9-stage pipeline (including source preparation, auto-calibration,
post-processing DSP, quality evaluation, and finalization) is orchestrated
by the TypeScript layer in ``packages/singing/src/pipeline/``, which calls
individual Python backends as subprocesses.
"""

import time
from pathlib import Path

from ..compat import patch_torch_load
from ..dto.request import CoverRequest
from ..dto.response import CoverResponse, StageResponse
from ..io.files import ensure_dir

patch_torch_load()


def run_cover_pipeline(request: CoverRequest) -> CoverResponse:
    """
    Execute the full cover pipeline:
    1. Separate vocals (MelBand/BS-RoFormer)
    2. Extract F0 (RMVPE)
    3. Convert vocals (RVC/Seed-VC)
    4. Remix (FFmpeg)
    """
    ensure_dir(request.output_dir)
    stages: list[StageResponse] = []

    try:
        t0 = time.time()
        if request.separator_backend == "melband":
            from ..backends.separator.melband_roformer import separate
        else:
            from ..backends.separator.bs_roformer import separate
        sep_result = separate(request.input_path, request.output_dir, request.separator_model)
        stages.append(
            StageResponse(
                stage="separate_vocals",
                success=True,
                duration_ms=(time.time() - t0) * 1000,
                artifacts={k: str(v) for k, v in sep_result.items()},
            )
        )
    except Exception as e:
        stages.append(
            StageResponse(
                stage="separate_vocals",
                success=False,
                duration_ms=0,
                error=str(e),
            )
        )
        return CoverResponse(success=False, stages=stages, error=str(e))

    try:
        t0 = time.time()
        from ..backends.pitch.rmvpe import extract_f0

        f0_path = extract_f0(sep_result["vocals"], request.output_dir)
        stages.append(
            StageResponse(
                stage="extract_f0",
                success=True,
                duration_ms=(time.time() - t0) * 1000,
                artifacts={"f0_path": f0_path},
            )
        )
    except Exception as e:
        stages.append(
            StageResponse(stage="extract_f0", success=False, duration_ms=0, error=str(e))
        )
        return CoverResponse(success=False, stages=stages, error=str(e))

    try:
        t0 = time.time()
        if request.converter_backend == "rvc":
            from ..backends.converter.rvc import convert

            output = convert(
                vocals_path=sep_result["vocals"],
                output_dir=request.output_dir,
                voice_id=request.voice_id or "",
                f0_up_key=request.f0_up_key,
                index_rate=request.index_rate,
                protect=request.protect,
                rms_mix_rate=request.rms_mix_rate,
            )
        else:
            from ..backends.converter.seed_vc import convert

            output = convert(
                vocals_path=sep_result["vocals"],
                reference_path=request.reference_path or "",
                output_dir=request.output_dir,
                diffusion_steps=request.diffusion_steps,
                f0_condition=request.f0_condition,
                auto_f0_adjust=request.auto_f0_adjust,
                semi_tone_shift=request.semi_tone_shift,
            )
        stages.append(
            StageResponse(
                stage="convert_vocals",
                success=True,
                duration_ms=(time.time() - t0) * 1000,
                artifacts={"output_path": output},
            )
        )
    except Exception as e:
        stages.append(
            StageResponse(stage="convert_vocals", success=False, duration_ms=0, error=str(e))
        )
        return CoverResponse(success=False, stages=stages, error=str(e))

    try:
        t0 = time.time()
        from ..backends.mix.ffmpeg_mix import remix

        final = remix(
            vocals_path=output,
            instrumental_path=sep_result["instrumental"],
            output_path=str(Path(request.output_dir) / "final_cover.wav"),
            vocal_gain_db=request.vocal_gain_db,
            inst_gain_db=request.inst_gain_db,
            ducking=request.ducking,
            target_lufs=request.target_lufs,
            true_peak_db=request.true_peak_db,
        )
        stages.append(
            StageResponse(
                stage="remix",
                success=True,
                duration_ms=(time.time() - t0) * 1000,
                artifacts={"output_path": final},
            )
        )
    except Exception as e:
        stages.append(StageResponse(stage="remix", success=False, duration_ms=0, error=str(e)))
        return CoverResponse(success=False, stages=stages, error=str(e))

    return CoverResponse(
        success=True,
        stages=stages,
        manifest_path=str(Path(request.output_dir) / "manifest.json"),
    )
