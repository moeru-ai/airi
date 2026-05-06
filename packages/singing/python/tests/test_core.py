"""Core unit tests for airi_singing_worker.

These tests exercise pure-function logic that does not require
GPU, model weights, or audio files — making them safe to run
in any CI environment.
"""

from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest
import soundfile as sf

from airi_singing_worker.backends.converter import rvc as rvc_backend
from airi_singing_worker.backends.postprocessor import vocal_postprocess
from airi_singing_worker.backends.separator.mask_refine import (
    reconstruct_stems_from_estimate,
    stabilize_lead_presence,
)
from airi_singing_worker.calibration.param_predictor import (
    PitchShiftResult,
    PredictedParams,
    predict_params,
    predict_pitch_shift,
)
from airi_singing_worker.calibration.voice_profile import build_voice_profile
from airi_singing_worker.errors.backend import MixError, PitchExtractionError
from airi_singing_worker.evaluation import (
    composite,
    content_preservation,
    melody_accuracy,
    naturalness,
    speaker_similarity,
)
from airi_singing_worker.pipelines import training_pipeline
from airi_singing_worker.evaluation.speaker_similarity import (
    compute_similarity,
)
from airi_singing_worker.evaluation.composite import (
    ReportCard,
    compute_overall_grade,
)


# ── speaker_similarity.compute_similarity ──────────────────

class TestComputeSimilarity:
    def test_identical_vectors(self):
        v = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        assert compute_similarity(v, v) == pytest.approx(1.0, abs=1e-6)

    def test_orthogonal_vectors(self):
        a = np.array([1.0, 0.0], dtype=np.float32)
        b = np.array([0.0, 1.0], dtype=np.float32)
        assert compute_similarity(a, b) == pytest.approx(0.5, abs=1e-6)

    def test_opposite_vectors(self):
        a = np.array([1.0, 0.0], dtype=np.float32)
        b = np.array([-1.0, 0.0], dtype=np.float32)
        assert compute_similarity(a, b) == pytest.approx(0.0, abs=1e-6)

    def test_zero_vector_returns_zero(self):
        a = np.zeros(5, dtype=np.float32)
        b = np.ones(5, dtype=np.float32)
        assert compute_similarity(a, b) == 0.0

    def test_result_range(self):
        rng = np.random.default_rng(42)
        for _ in range(50):
            a = rng.standard_normal(128).astype(np.float32)
            b = rng.standard_normal(128).astype(np.float32)
            sim = compute_similarity(a, b)
            assert 0.0 <= sim <= 1.0


# ── composite.compute_overall_grade ────────────────────────

class TestComputeOverallGrade:
    @staticmethod
    def _make_card(**overrides) -> ReportCard:
        defaults = dict(
            voice_id="test_voice",
            singer_similarity=0.9,
            content_score=0.8,
            f0_corr=0.9,
            f0_rmse_cents=30.0,
            st_accuracy=0.85,
            vuv_error=0.1,
            mcd=5.0,
            loudness_rmse=2.0,
            naturalness_mos=4.0,
            tearing_score=0.1,
            hnr=20.0,
        )
        defaults.update(overrides)
        return ReportCard(**defaults)

    def test_high_scores_grade_a(self):
        card = self._make_card(
            singer_similarity=0.95,
            content_score=0.95,
            f0_corr=0.95,
            naturalness_mos=4.5,
        )
        assert compute_overall_grade(card) == "A"

    def test_medium_scores_not_a(self):
        card = self._make_card(
            singer_similarity=0.5,
            content_score=0.5,
            f0_corr=0.5,
            naturalness_mos=2.5,
        )
        grade = compute_overall_grade(card)
        assert grade in ("B", "C", "D", "F")

    def test_very_low_scores_grade_f(self):
        card = self._make_card(
            singer_similarity=0.0,
            content_score=0.0,
            f0_corr=0.0,
            naturalness_mos=1.0,
        )
        assert compute_overall_grade(card) == "F"

    def test_returns_valid_grade(self):
        card = self._make_card()
        assert compute_overall_grade(card) in ("A", "B", "C", "D", "F")


class TestEvaluationIdentityResolution:
    @staticmethod
    def _patch_non_identity_axes(monkeypatch):
        monkeypatch.setattr(content_preservation, "transcribe_audio", lambda _: "la la la")
        monkeypatch.setattr(content_preservation, "compute_cer", lambda _a, _b: 0.02)

        f0 = np.array([220.0, 221.0, 222.0], dtype=np.float32)
        monkeypatch.setattr(melody_accuracy, "extract_f0_from_audio", lambda _: f0)
        monkeypatch.setattr(melody_accuracy, "f0_correlation", lambda _a, _b: 0.99)
        monkeypatch.setattr(melody_accuracy, "f0_rmse_cents", lambda _a, _b: 5.0)
        monkeypatch.setattr(melody_accuracy, "semitone_accuracy", lambda _a, _b: 0.98)
        monkeypatch.setattr(melody_accuracy, "vuv_error_rate", lambda _a, _b: 0.01)

        monkeypatch.setattr(naturalness, "compute_mcd", lambda _a, _b: 4.0)
        monkeypatch.setattr(naturalness, "compute_loudness_rmse", lambda _a, _b: 1.0)
        monkeypatch.setattr(naturalness, "predict_mos", lambda _a: 4.1)
        monkeypatch.setattr(composite, "_compute_tearing_score", lambda *_args: 0.05)
        monkeypatch.setattr(composite, "_compute_hnr", lambda *_args: 18.0)

    def test_run_evaluation_uses_reference_embedding_for_malformed_external_profile(self, monkeypatch):
        self._patch_non_identity_axes(monkeypatch)

        ref_emb = np.array([1.0, 0.0], dtype=np.float32)
        synth_emb = np.array([0.5, 0.5], dtype=np.float32)
        similarity_inputs = []

        def fake_extract_embedding(path: str) -> np.ndarray:
            return ref_emb if path == "ref.wav" else synth_emb

        def fake_compute_similarity(emb_a: np.ndarray, emb_b: np.ndarray) -> float:
            similarity_inputs.append((emb_a.copy(), emb_b.copy()))
            return 0.77 if np.array_equal(emb_a, ref_emb) else 0.11

        monkeypatch.setattr(speaker_similarity, "extract_embedding", fake_extract_embedding)
        monkeypatch.setattr(speaker_similarity, "compute_similarity", fake_compute_similarity)

        card = composite.run_evaluation(
            ref_audio="ref.wav",
            synth_audio="synth.wav",
            voice_profile_data={"embedding_centroid": [1.0]},
            voice_id="test_voice",
        )

        assert card.singer_similarity == pytest.approx(0.77)
        assert len(similarity_inputs) == 1
        assert np.array_equal(similarity_inputs[0][0], ref_emb)
        assert np.array_equal(similarity_inputs[0][1], synth_emb)

    def test_run_evaluation_uses_profile_centroid_when_it_is_valid(self, monkeypatch):
        self._patch_non_identity_axes(monkeypatch)

        ref_emb = np.array([1.0, 0.0], dtype=np.float32)
        synth_emb = np.array([0.5, 0.5], dtype=np.float32)
        centroid = np.array([0.0, 1.0], dtype=np.float32)
        similarity_inputs = []

        def fake_extract_embedding(path: str) -> np.ndarray:
            return ref_emb if path == "ref.wav" else synth_emb

        def fake_compute_similarity(emb_a: np.ndarray, emb_b: np.ndarray) -> float:
            similarity_inputs.append((emb_a.copy(), emb_b.copy()))
            return 0.66 if np.array_equal(emb_a, centroid) else 0.12

        monkeypatch.setattr(speaker_similarity, "extract_embedding", fake_extract_embedding)
        monkeypatch.setattr(speaker_similarity, "compute_similarity", fake_compute_similarity)

        card = composite.run_evaluation(
            ref_audio="ref.wav",
            synth_audio="synth.wav",
            voice_profile_data={"embedding_centroid": centroid.tolist()},
            voice_id="test_voice",
        )

        assert card.singer_similarity == pytest.approx(0.66)
        assert len(similarity_inputs) == 1
        assert np.array_equal(similarity_inputs[0][0], centroid)
        assert np.array_equal(similarity_inputs[0][1], synth_emb)


class TestVoiceProfileValidation:
    def test_build_voice_profile_rejects_missing_training_segments(self):
        with pytest.raises(Exception, match="No training segments"):
            build_voice_profile([], "test_voice")

    def test_build_voice_profile_rejects_empty_embedding_centroid(self, monkeypatch):
        monkeypatch.setattr(
            "airi_singing_worker.evaluation.speaker_similarity.extract_embedding",
            lambda _path: (_ for _ in ()).throw(RuntimeError("embedding failed")),
        )

        with pytest.raises(Exception, match="speaker embeddings"):
            build_voice_profile(["seg_a.wav", "seg_b.wav"], "test_voice")


class TestRvcBackendCompatibility:
    def test_convert_uses_registry_style_loading_for_newer_rvc_python_api(self, monkeypatch, tmp_path):
        model_dir = tmp_path / "voice_models" / "test_voice"
        model_dir.mkdir(parents=True)
        model_path = model_dir / "test_voice.pth"
        index_path = model_dir / "test_voice.index"
        input_path = tmp_path / "input.wav"
        output_dir = tmp_path / "output"

        model_path.write_bytes(b"fake-model")
        index_path.write_bytes(b"fake-index")
        sf.write(input_path, np.zeros(4000, dtype=np.float32), 40000)

        monkeypatch.setattr(rvc_backend, "_ensure_inference_format", lambda path: path)
        monkeypatch.setattr(rvc_backend, "_get_inference_device", lambda: "cpu")

        instances = []

        class FakeRVCInference:
            def __init__(self, models_dir=None, device=None):
                self.models_dir = models_dir
                self.device = device
                self.resample_sr = 44100
                self.current_model = None
                self.models = {}
                for candidate in Path(models_dir).iterdir():
                    if candidate.is_dir():
                        name = candidate.name
                        self.models[name] = {
                            "pth": str(candidate / f"{name}.pth"),
                            "index": str(candidate / f"{name}.index"),
                        }
                instances.append(self)

            def load_model(self, model_name, version="v2"):
                self.current_model = model_name

            def set_params(self, **_kwargs):
                return None

            def infer_file(self, _input_path, output_path):
                sf.write(output_path, np.zeros(4410, dtype=np.float32), 44100)

        import sys
        import types

        fake_rvc_python = types.ModuleType("rvc_python")
        fake_rvc_infer = types.ModuleType("rvc_python.infer")
        fake_rvc_infer.RVCInference = FakeRVCInference
        fake_rvc_python.infer = fake_rvc_infer

        monkeypatch.setitem(sys.modules, "rvc_python", fake_rvc_python)
        monkeypatch.setitem(sys.modules, "rvc_python.infer", fake_rvc_infer)

        output_path = rvc_backend.convert(
            vocals_path=str(input_path),
            output_dir=str(output_dir),
            model_path=str(model_path),
            index_file=str(index_path),
            voice_id="test_voice",
        )

        assert Path(output_path).exists()
        assert len(instances) == 1
        assert instances[0].current_model == "test_voice"
        assert Path(instances[0].models_dir) == tmp_path / "voice_models"


class TestTrainingQaSelection:
    def test_prepare_holdout_eval_clips_caps_and_materializes_representative_subset(self, tmp_path):
        holdout_dir = tmp_path / "holdout"
        eval_dir = tmp_path / "eval"
        holdout_dir.mkdir()
        eval_dir.mkdir()

        manifest = []
        sr = 40000
        for index in range(12):
            path = holdout_dir / f"0_{index}.wav"
            tone = np.sin(np.linspace(0, np.pi * 16, sr * 3, dtype=np.float32)) * 0.2
            sf.write(path, tone, sr)
            manifest.append({
                "filename": path.name,
                "path": str(path),
                "tag": ["low", "mid", "high"][index % 3],
                "duration_sec": 3.0,
                "rms_db": -14.0,
            })

        clips = training_pipeline._prepare_holdout_eval_clips(manifest, str(eval_dir))

        assert 3 <= len(clips) <= 6
        for clip in clips:
            assert Path(clip["path"]).exists()
            assert clip["tag"] in {"low", "mid", "high", "mixed"}


class TestVocalPostprocess:
    def test_spectral_denoise_reduces_high_frequency_noise_energy(self):
        sr = 44100
        duration = 2.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False, dtype=np.float32)
        clean = 0.2 * np.sin(2 * np.pi * 220 * t)
        hiss = 0.05 * np.sin(2 * np.pi * 9000 * t)
        noisy = clean + hiss

        processed = vocal_postprocess.spectral_denoise(noisy, sr)

        def hf_energy(data: np.ndarray) -> float:
            spec = np.abs(np.fft.rfft(data[:2048] * np.hanning(2048)))
            freqs = np.fft.rfftfreq(2048, d=1.0 / sr)
            mask = freqs >= 6000
            return float(np.mean(spec[mask] ** 2))

        assert hf_energy(processed) < hf_energy(noisy)


# ── Zero-fallback error behavior tests ─────────────────────

class TestRmvpeRequiresModel:
    def test_extract_f0_errors_when_model_missing(self, tmp_path, monkeypatch):
        """rmvpe.py must raise PitchExtractionError when RMVPE model is not found."""
        from airi_singing_worker.backends.pitch import rmvpe

        monkeypatch.setenv("RMVPE_MODEL_PATH", "")
        monkeypatch.setattr(rmvpe, "_find_rmvpe_model", lambda: None)

        with pytest.raises(PitchExtractionError, match="RMVPE model not found"):
            rmvpe.extract_f0(str(tmp_path / "input.wav"), str(tmp_path))


class TestFfmpegMixRequiresFFmpeg:
    def test_remix_errors_when_ffmpeg_missing(self, tmp_path, monkeypatch):
        """ffmpeg_mix.py must raise MixError when FFmpeg is not found."""
        from airi_singing_worker.backends.mix import ffmpeg_mix

        monkeypatch.setattr(ffmpeg_mix, "_find_ffmpeg", lambda: None)

        with pytest.raises(MixError, match="FFmpeg is required"):
            ffmpeg_mix.remix(
                vocals_path=str(tmp_path / "v.wav"),
                instrumental_path=str(tmp_path / "i.wav"),
                output_path=str(tmp_path / "out.wav"),
            )


class TestPitchShiftClamp:
    def test_pitch_shift_clamps_to_max_shift(self):
        """predict_pitch_shift must clamp to max_shift semitones."""
        from airi_singing_worker.calibration.source_analyzer import SourceFeatures
        from airi_singing_worker.calibration.voice_profile import VoiceProfile

        source = SourceFeatures(
            f0_median=220.0,
            f0_p10=180.0,
            f0_p90=330.0,
            f0_min=150.0,
            f0_max=400.0,
            dynamic_range=0.5,
            sibilance_score=0.2,
            spectral_flatness=0.1,
            unvoiced_ratio=0.15,
            bleed_score=0.1,
            source_quality=3.5,
            speaker_embedding=None,
        )

        # Target voice with very different median — would need >4 semitone shift
        profile = VoiceProfile(
            f0_p10=400.0,
            f0_p50=500.0,
            f0_p90=700.0,
        )

        result = predict_pitch_shift(source, profile, max_shift=4)
        assert isinstance(result, PitchShiftResult)
        assert -4 <= result.shift <= 4

    def test_pitch_shift_returns_zero_confidence_on_insufficient_stats(self):
        """predict_pitch_shift returns confidence=0 when F0 stats are insufficient."""
        from airi_singing_worker.calibration.source_analyzer import SourceFeatures
        from airi_singing_worker.calibration.voice_profile import VoiceProfile

        source = SourceFeatures(
            f0_median=0.0,
            f0_p10=0.0,
            f0_p90=0.0,
            f0_min=0.0,
            f0_max=0.0,
            dynamic_range=0.5,
            sibilance_score=0.2,
            spectral_flatness=0.1,
            unvoiced_ratio=0.5,
            bleed_score=0.1,
            source_quality=2.0,
            speaker_embedding=None,
        )

        profile = VoiceProfile(
            f0_p10=200.0,
            f0_p50=300.0,
            f0_p90=400.0,
        )

        result = predict_pitch_shift(source, profile)
        assert result.shift == 0
        assert result.confidence == 0.0


class TestPredictedParamsConfidence:
    def test_predicted_params_includes_pitch_confidence(self):
        """predict_params must include pitch_confidence in its output."""
        from airi_singing_worker.calibration.source_analyzer import SourceFeatures
        from airi_singing_worker.calibration.voice_profile import VoiceProfile

        source = SourceFeatures(
            f0_median=220.0,
            f0_p10=180.0,
            f0_p90=330.0,
            f0_min=150.0,
            f0_max=400.0,
            dynamic_range=0.5,
            sibilance_score=0.2,
            spectral_flatness=0.1,
            unvoiced_ratio=0.15,
            bleed_score=0.1,
            source_quality=3.5,
            speaker_embedding=None,
        )
        profile = VoiceProfile(
            f0_p10=200.0,
            f0_p50=250.0,
            f0_p90=350.0,
        )

        result = predict_params(source, profile)
        assert isinstance(result, PredictedParams)
        assert hasattr(result, "pitch_confidence")
        assert 0.0 <= result.pitch_confidence <= 1.0

    def test_zero_confidence_when_f0_stats_insufficient(self):
        """pitch_confidence must be 0.0 when F0 stats are insufficient."""
        from airi_singing_worker.calibration.source_analyzer import SourceFeatures
        from airi_singing_worker.calibration.voice_profile import VoiceProfile

        source = SourceFeatures(
            f0_median=0.0,
            f0_p10=0.0,
            f0_p90=0.0,
            f0_min=0.0,
            f0_max=0.0,
        )
        profile = VoiceProfile(
            f0_p10=200.0,
            f0_p50=300.0,
            f0_p90=400.0,
        )

        result = predict_params(source, profile)
        assert result.pitch_shift == 0
        assert result.pitch_confidence == 0.0

    def test_confidence_serialized_in_to_dict(self):
        """pitch_confidence must appear in to_dict() output."""
        params = PredictedParams(pitch_shift=2, pitch_confidence=0.85)
        d = params.to_dict()
        assert "pitch_confidence" in d
        assert d["pitch_confidence"] == 0.85


class TestModelArchDetection:
    def test_detect_v2_40k_from_metadata(self):
        """_detect_model_arch detects v2 40k from checkpoint metadata."""
        from airi_singing_worker.backends.converter.rvc import _detect_model_arch

        version, sr_key, f0_flag = _detect_model_arch(
            weights={},
            meta={"version": "v2", "sr": "40k", "f0": 1},
        )
        assert version == "v2"
        assert sr_key == "40k"
        assert f0_flag == 1

    def test_detect_v2_48k_from_metadata(self):
        """_detect_model_arch detects v2 48k from checkpoint metadata."""
        from airi_singing_worker.backends.converter.rvc import _detect_model_arch

        version, sr_key, f0_flag = _detect_model_arch(
            weights={},
            meta={"version": "v2", "sr": "48k", "f0": 1},
        )
        assert version == "v2"
        assert sr_key == "48k"

    def test_detect_v1_from_metadata(self):
        """_detect_model_arch detects v1 from checkpoint metadata."""
        from airi_singing_worker.backends.converter.rvc import _detect_model_arch

        version, sr_key, f0_flag = _detect_model_arch(
            weights={},
            meta={"version": "v1", "sr": "40k", "f0": 1},
        )
        assert version == "v1"
        assert sr_key == "40k"

    def test_detect_numeric_sr(self):
        """_detect_model_arch parses numeric sample rate (e.g. 40000)."""
        from airi_singing_worker.backends.converter.rvc import _detect_model_arch

        version, sr_key, _ = _detect_model_arch(
            weights={},
            meta={"version": "v2", "sr": 40000},
        )
        assert sr_key == "40k"

    def test_defaults_to_v2_40k_when_no_metadata(self):
        """_detect_model_arch defaults to v2 40k when no metadata is present."""
        from airi_singing_worker.backends.converter.rvc import _detect_model_arch

        version, sr_key, _ = _detect_model_arch(weights={}, meta={})
        assert version == "v2"
        assert sr_key == "40k"

    def test_ensure_inference_format_errors_on_unsupported_arch(self, tmp_path, monkeypatch):
        """_ensure_inference_format must raise ConversionError for unsupported arch."""
        import torch
        from airi_singing_worker.backends.converter.rvc import _ensure_inference_format
        from airi_singing_worker.errors.backend import ConversionError

        model_path = tmp_path / "model.pth"
        cpt = {
            "model": {"dummy_weight": torch.zeros(1)},
            "version": "v3",
            "sr": "96k",
        }
        torch.save(cpt, str(model_path))

        with pytest.raises(ConversionError, match="Unsupported RVC architecture"):
            _ensure_inference_format(str(model_path))


class TestAdapterLoadingErrors:
    def test_pitch_adapter_errors_when_weights_missing(self):
        """PitchAdapter loader must error when weights file doesn't exist."""
        from airi_singing_worker.adapters.pitch_adapter import load_pitch_adapter

        with pytest.raises(RuntimeError, match="PitchAdapter weights not found"):
            load_pitch_adapter(weights_path="/nonexistent/path.pt")

    def test_param_controller_errors_when_weights_missing(self):
        """ParamController loader must error when weights file doesn't exist."""
        from airi_singing_worker.adapters.param_controller import load_param_controller

        with pytest.raises(RuntimeError, match="ParamController weights not found"):
            load_param_controller(weights_path="/nonexistent/path.pt")

    def test_post_filter_errors_when_weights_missing(self):
        """PostFilter loader must error when weights file doesn't exist."""
        from airi_singing_worker.adapters.post_filter import load_post_filter

        with pytest.raises(RuntimeError, match="PostFilter weights not found"):
            load_post_filter(weights_path="/nonexistent/path.pt")


# ── Lead vocal isolator tests ──────────────────────────────

class TestLeadVocalIsolator:
    def test_isolate_errors_when_checkpoint_missing(self, monkeypatch):
        """lead_vocal_isolator must raise SeparationError when checkpoint is missing."""
        from airi_singing_worker.backends.separator import lead_vocal_isolator
        from airi_singing_worker.errors.backend import SeparationError

        monkeypatch.setenv("KARAOKE_CKPT_PATH", "/nonexistent/karaoke.ckpt")
        monkeypatch.setenv("KARAOKE_CONFIG_PATH", "/nonexistent/config.yaml")

        with pytest.raises(SeparationError, match="Karaoke checkpoint not found"):
            lead_vocal_isolator.isolate("/some/input.wav", "/some/output")

    def test_isolate_errors_when_env_not_set(self, monkeypatch):
        """lead_vocal_isolator must raise SeparationError when env vars are empty."""
        from airi_singing_worker.backends.separator import lead_vocal_isolator
        from airi_singing_worker.errors.backend import SeparationError

        monkeypatch.setenv("KARAOKE_CKPT_PATH", "")
        monkeypatch.setenv("KARAOKE_CONFIG_PATH", "")

        with pytest.raises(SeparationError, match="Karaoke model paths not configured"):
            lead_vocal_isolator.isolate("/some/input.wav", "/some/output")

    def test_isolate_errors_when_config_missing(self, monkeypatch, tmp_path):
        """lead_vocal_isolator must raise SeparationError when config file is missing."""
        from airi_singing_worker.backends.separator import lead_vocal_isolator
        from airi_singing_worker.errors.backend import SeparationError

        ckpt = tmp_path / "karaoke.ckpt"
        ckpt.write_bytes(b"fake-checkpoint")

        monkeypatch.setenv("KARAOKE_CKPT_PATH", str(ckpt))
        monkeypatch.setenv("KARAOKE_CONFIG_PATH", "/nonexistent/config.yaml")

        with pytest.raises(SeparationError, match="Karaoke config not found"):
            lead_vocal_isolator.isolate("/some/input.wav", "/some/output")


class TestMaskRefine:
    def test_reconstruct_stems_from_estimate_preserves_mixture_energy(self):
        sr = 44100
        t = np.linspace(0, 1.0, sr, endpoint=False, dtype=np.float32)
        lead = 0.3 * np.sin(2 * np.pi * 220 * t)
        backing = 0.2 * np.sin(2 * np.pi * 440 * t)
        mix = lead + backing
        estimate = lead * 0.85

        refined_lead, refined_backing = reconstruct_stems_from_estimate(mix, estimate, sr)
        reconstructed = refined_lead + refined_backing

        assert np.max(np.abs(reconstructed - mix)) < 0.06

    def test_stabilize_lead_presence_blends_back_missing_sections(self):
        sr = 44100
        t = np.linspace(0, 1.0, sr, endpoint=False, dtype=np.float32)
        mix = 0.35 * np.sin(2 * np.pi * 220 * t)
        lead = mix.copy()
        lead[int(sr * 0.35):int(sr * 0.55)] *= 0.05

        stabilized = stabilize_lead_presence(lead, mix, sr)

        hole = slice(int(sr * 0.40), int(sr * 0.50))
        original_rms = float(np.sqrt(np.mean(lead[hole] ** 2)))
        stabilized_rms = float(np.sqrt(np.mean(stabilized[hole] ** 2)))
        mix_rms = float(np.sqrt(np.mean(mix[hole] ** 2)))

        assert stabilized_rms > original_rms * 2.5
        assert stabilized_rms <= mix_rms


# ── CoverRequest DTO tests ─────────────────────────────────

class TestCoverRequestDto:
    def test_isolate_lead_vocal_defaults_to_true(self):
        """CoverRequest.isolate_lead_vocal must default to True."""
        from airi_singing_worker.dto.request import CoverRequest

        req = CoverRequest(input_path="/in.wav", output_dir="/out")
        assert req.isolate_lead_vocal is True

    def test_isolate_lead_vocal_can_be_disabled(self):
        """CoverRequest.isolate_lead_vocal can be set to False."""
        from airi_singing_worker.dto.request import CoverRequest

        req = CoverRequest(
            input_path="/in.wav",
            output_dir="/out",
            isolate_lead_vocal=False,
        )
        assert req.isolate_lead_vocal is False
