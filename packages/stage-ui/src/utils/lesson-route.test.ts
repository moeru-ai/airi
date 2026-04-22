import { describe, expect, it } from 'vitest'

import { isLessonPath, isLessonRouteLike, resolveLessonPageUid } from './lesson-route'

describe('lesson route utils', () => {
  it('matches lesson paths with query strings', () => {
    expect(isLessonPath('/lesson?page_uid=TB-G5S1U3-P24')).toBe(true)
  })

  it('matches lesson routes by route name', () => {
    expect(isLessonRouteLike({
      name: 'LessonScenePage',
      path: '/anywhere',
    })).toBe(true)
  })

  it('matches lesson routes through matched records', () => {
    expect(isLessonRouteLike({
      name: 'OtherPage',
      path: '/other',
      matched: [
        {
          name: 'NestedPage',
          path: '/nested',
        },
        {
          name: 'LessonScenePage',
          path: '/lesson',
        },
      ],
    })).toBe(true)
  })

  it('rejects non-lesson routes', () => {
    expect(isLessonRouteLike({
      name: 'HomePage',
      path: '/',
    })).toBe(false)
  })

  it('keeps a known lesson page uid query', () => {
    expect(resolveLessonPageUid(
      'TB-G6S2Recycle2-P49',
      [
        'TB-G5S1U3-P24',
        'TB-G6S2Recycle2-P49',
      ],
      'TB-G5S1U3-P24',
    )).toBe('TB-G6S2Recycle2-P49')
  })

  it('falls back to the selected page when the query page is unknown', () => {
    expect(resolveLessonPageUid(
      'TB-UNKNOWN-P404',
      [
        'TB-G5S1U3-P24',
        'TB-G6S2Recycle2-P49',
      ],
      'TB-G6S2Recycle2-P49',
    )).toBe('TB-G6S2Recycle2-P49')
  })

  it('falls back to the first known page when the query and fallback are missing', () => {
    expect(resolveLessonPageUid(
      '',
      [
        'TB-G5S1U3-P24',
        'TB-G6S2Recycle2-P49',
      ],
      '',
    )).toBe('TB-G5S1U3-P24')
  })
})
