"""Core unit tests for airi_singing_worker.

These tests exercise pure-function logic that does not require
GPU, model weights, or audio files — making them safe to run
in any CI environment.
"""

import numpy as np
import pytest

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
