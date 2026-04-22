import { describe, expect, it } from 'vitest'

import { lessonStageDefaultModelId, resolveLessonStageModelSelection } from './lesson-stage-model'

describe('lesson stage model utils', () => {
  it('falls back to the default lesson model when the selection is empty', () => {
    expect(resolveLessonStageModelSelection('')).toBe(lessonStageDefaultModelId)
    expect(resolveLessonStageModelSelection('   ')).toBe(lessonStageDefaultModelId)
    expect(resolveLessonStageModelSelection(undefined)).toBe(lessonStageDefaultModelId)
    expect(resolveLessonStageModelSelection(null)).toBe(lessonStageDefaultModelId)
  })

  it('keeps an explicit model selection intact', () => {
    expect(resolveLessonStageModelSelection('preset-live2d-2')).toBe('preset-live2d-2')
  })
})
