import { describe, expect, it } from 'vitest'

import { progressPhraseFrom } from './progress-language'

const now = new Date('2026-06-11T12:00:00.000Z')

describe('progressPhraseFrom', () => {
  it('keeps a humanized remaining phrase and formats a same-day ETA as time only', () => {
    const phrase = progressPhraseFrom({
      remainingWork: '还差两节',
      etaAt: '2026-06-11T17:40:00.000Z',
      pace: '约 20 分钟/节',
      isOffTrack: false,
    }, { locale: 'zh-CN', now, timeZone: 'UTC' })

    expect(phrase.remaining).toBe('还差两节')
    expect(phrase.eta).toBe('17:40')
    expect(phrase.pace).toBe('约 20 分钟/节')
    expect(phrase.isOffTrack).toBe(false)
  })

  it('includes the date when the ETA crosses to another day', () => {
    const phrase = progressPhraseFrom({
      remainingWork: '2 sections left',
      etaAt: '2026-06-12T09:30:00.000Z',
      isOffTrack: true,
    }, { locale: 'en-US', now, timeZone: 'UTC' })

    expect(phrase.eta).toContain('12')
    expect(phrase.eta).toContain('09:30')
    expect(phrase.isOffTrack).toBe(true)
  })

  it('respects the task timezone when deciding whether the ETA is today', () => {
    // 2026-06-11T17:40Z is already 2026-06-12 in Asia/Tokyo (UTC+9),
    // so the phrase must include the date even though the UTC day matches.
    const phrase = progressPhraseFrom({
      remainingWork: '还差两节',
      etaAt: '2026-06-11T17:40:00.000Z',
      isOffTrack: false,
    }, { locale: 'en-US', now, timeZone: 'Asia/Tokyo' })

    expect(phrase.eta).toContain('12')
  })

  it('strips bare-percentage remaining text (shared guard) so callers must fall back', () => {
    const phrase = progressPhraseFrom({
      remainingWork: 'done: 99.5%',
      isOffTrack: false,
    }, { locale: 'en-US', now, timeZone: 'UTC' })

    expect(phrase.remaining).toBeUndefined()
    expect(phrase.eta).toBeUndefined()
  })

  it('drops empty and unparsable inputs instead of rendering placeholders', () => {
    const phrase = progressPhraseFrom({
      remainingWork: '  ',
      etaAt: 'not-a-date',
      pace: '',
      isOffTrack: false,
    }, { locale: 'en-US', now, timeZone: 'UTC' })

    expect(phrase.remaining).toBeUndefined()
    expect(phrase.eta).toBeUndefined()
    expect(phrase.pace).toBeUndefined()
  })
})
