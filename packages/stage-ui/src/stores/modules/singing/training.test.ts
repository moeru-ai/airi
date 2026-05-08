// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useSingingTrainingStore } from './training'

describe('useSingingTrainingStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('normalizes incomplete persisted report cards into a render-safe shape', async () => {
    localStorage.setItem('singing/training/report-card', JSON.stringify({
      overall_grade: 'C',
      singer_similarity: 0.18,
    }))

    const trainingStore = useSingingTrainingStore()

    await nextTick()

    expect(trainingStore.reportCard).toEqual({
      overall_grade: 'C',
      singer_similarity: 0.18,
      content_score: 0,
      f0_corr: 0,
      naturalness_mos: 0,
      f0_rmse_cents: 0,
      mcd: 0,
      worst_samples: [],
      per_bucket_scores: {},
    })
    expect(JSON.parse(localStorage.getItem('singing/training/report-card') ?? 'null')).toEqual(trainingStore.reportCard)
  })
})
