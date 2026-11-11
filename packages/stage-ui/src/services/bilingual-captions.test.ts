import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBilingualCaptionBus } from './bilingual-captions'

const publishCaptionMock = vi.hoisted(() => vi.fn<(event: CaptionChannelEvent) => void>())

vi.mock('@proj-airi/stage-shared', () => ({
  publishCaption: publishCaptionMock,
}))

function published() {
  return publishCaptionMock.mock.calls.map(([event]) => event)
}

describe('bilingual caption bus', () => {
  beforeEach(() => {
    useBilingualCaptionBus().resetAll()
    publishCaptionMock.mockClear()
  })

  it('reveals a translation only after its pair starts playing', () => {
    const bus = useBilingualCaptionBus()
    bus.ingestTranslation('turn-wait', { language: 'zh', pairId: 0, spokenStart: 0, text: '你好' })

    expect(published()).toEqual([])

    bus.notePlayedPair('turn-wait', 0)

    expect(published()).toEqual([
      { operation: 'replace', text: '你好', type: 'caption-assistant-translation', label: '中文' },
    ])
  })

  it('reveals earlier pairs when a later pair starts', () => {
    const bus = useBilingualCaptionBus()
    bus.ingestTranslation('turn-order', { language: 'zh', pairId: 0, spokenStart: 0, text: '你好' })
    bus.ingestTranslation('turn-order', { language: 'zh', pairId: 1, spokenStart: 3, text: '嗨' })

    bus.notePlayedPair('turn-order', 1)

    expect(published().map(event => event.text)).toEqual(['你好', '嗨'])
  })

  it('ignores a pair cursor that moves backwards', () => {
    const bus = useBilingualCaptionBus()
    bus.ingestTranslation('turn-back', { language: 'zh', pairId: 0, spokenStart: 0, text: '你好' })
    bus.ingestTranslation('turn-back', { language: 'zh', pairId: 1, spokenStart: 3, text: '嗨' })
    bus.notePlayedPair('turn-back', 1)
    publishCaptionMock.mockClear()

    bus.notePlayedPair('turn-back', 0)

    expect(published()).toEqual([])
  })

  it('reveals a translation that arrives after its pair played', () => {
    const bus = useBilingualCaptionBus()
    bus.notePlayedPair('turn-late', 0)

    expect(published()).toEqual([])

    bus.ingestTranslation('turn-late', { language: 'zh', pairId: 0, spokenStart: 0, text: '你好' })

    expect(published().map(event => event.text)).toEqual(['你好'])
  })

  it('falls back to the spoken offset for clips without a pair', () => {
    const bus = useBilingualCaptionBus()
    bus.ingestTranslation('turn-stream', { language: 'zh', pairId: 0, spokenStart: 20, text: '你好' })
    bus.ingestTranslation('turn-stream', { language: 'zh', pairId: 1, spokenStart: 40, text: '嗨' })

    bus.notePlayedText('turn-stream', 'a'.repeat(25))

    expect(published().map(event => event.text)).toEqual(['你好'])

    bus.notePlayedText('turn-stream', 'b'.repeat(20))

    expect(published().map(event => event.text)).toEqual(['你好', '嗨'])
  })

  it('publishes unplayed translations in pair order when the turn ends', () => {
    const bus = useBilingualCaptionBus()
    bus.ingestTranslation('turn-flush', { language: 'zh', pairId: 0, spokenStart: 0, text: '你好' })
    bus.ingestTranslation('turn-flush', { language: 'zh', pairId: 1, spokenStart: 3, text: '嗨' })

    bus.flushTurn('turn-flush')

    expect(published()).toEqual([
      { operation: 'replace', text: '你好\n嗨', type: 'caption-assistant-translation', label: '中文' },
    ])
  })

  it('clears the line when a turn is interrupted', () => {
    const bus = useBilingualCaptionBus()
    bus.ingestTranslation('turn-reset', { language: 'zh', pairId: 0, spokenStart: 0, text: '你好' })

    bus.resetTurn('turn-reset')

    expect(published()).toEqual([
      { operation: 'replace', text: '', type: 'caption-assistant-translation' },
    ])
  })
})
