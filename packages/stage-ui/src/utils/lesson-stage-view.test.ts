import { describe, expect, it } from 'vitest'

import { lessonStageDesktopView, lessonStageMobileView, resolveLessonStageView } from './lesson-stage-view'

describe('resolveLessonStageView', () => {
  it('returns the stable desktop lesson view', () => {
    expect(resolveLessonStageView(false)).toEqual(lessonStageDesktopView)
  })

  it('returns the stable mobile lesson view', () => {
    expect(resolveLessonStageView(true)).toEqual(lessonStageMobileView)
  })
})
