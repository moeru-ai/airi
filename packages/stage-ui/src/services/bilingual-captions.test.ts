import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import { afterEach, describe, expect, it } from 'vitest'

import { resetSpeechTurnFlags, useBilingualCaptionBus } from './bilingual-captions'

// The bus opens its channel lazily, so a fake installed before first use
// captures every post without touching a real BroadcastChannel.
const posted: CaptionChannelEvent[] = []

class FakeBroadcastChannel {
  constructor(public name: string) {}
  postMessage(event: CaptionChannelEvent) {
    posted.push(event)
  }

  close() {}
  addEventListener() {}
  removeEventListener() {}
}

;(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = FakeBroadcastChannel

const bus = useBilingualCaptionBus()

function pair(pairId: number, text: string, language = 'zh') {
  return { language, pairId, text }
}

afterEach(() => {
  posted.length = 0
  bus.resetAll()
  resetSpeechTurnFlags()
})

describe('bilingual caption bus playback alignment', () => {
  it('reveals a translation only after its playback clip starts', () => {
    bus.ingestTranslation('turn-a', pair(0, '第一'))
    expect(posted).toHaveLength(0)

    bus.advancePlayback('turn-a')
    expect(posted).toHaveLength(1)
    expect(posted[0]?.text).toBe('第一')

    // The next translation waits for its own clip; it does not jump ahead.
    bus.ingestTranslation('turn-a', pair(1, '第二'))
    expect(posted).toHaveLength(1)
    bus.advancePlayback('turn-a')
    expect(posted).toHaveLength(2)
    expect(posted[1]?.text).toBe('第二')
  })

  it('flushes unplayed pairs as one ordered multiline block on normal finish', () => {
    bus.ingestTranslation('turn-b', pair(0, '一'))
    bus.ingestTranslation('turn-b', pair(1, '二'))
    bus.ingestTranslation('turn-b', pair(2, '三'))
    bus.advancePlayback('turn-b')
    posted.length = 0

    bus.flushTurn('turn-b')
    expect(posted).toHaveLength(1)
    expect(posted[0]?.text).toBe('二\n三')

    // Terminal and idempotent: a second end hook must not repost.
    bus.flushTurn('turn-b')
    expect(posted).toHaveLength(1)
  })

  it('discards every pending pair and clears the caption when the turn is interrupted', () => {
    bus.ingestTranslation('turn-c', pair(0, '一'))
    bus.ingestTranslation('turn-c', pair(1, '二'))
    bus.ingestTranslation('turn-c', pair(2, '三'))
    bus.advancePlayback('turn-c')
    posted.length = 0

    bus.resetTurn('turn-c')
    expect(posted).toEqual([{
      operation: 'replace',
      text: '',
      type: 'caption-assistant-translation',
    }])

    // Late hooks after the reset must neither dump nor recreate captions.
    bus.resetTurn('turn-c')
    bus.flushTurn('turn-c')
    expect(posted).toHaveLength(1)
  })

  it('resetAll clears every turn with one reset event', () => {
    bus.ingestTranslation('turn-d', pair(0, '一'))
    bus.ingestTranslation('turn-e', pair(0, '二'))
    posted.length = 0

    bus.resetAll()
    expect(posted).toEqual([{
      operation: 'replace',
      text: '',
      type: 'caption-assistant-translation',
    }])

    bus.ingestTranslation('turn-d', pair(0, '三'))
    bus.advancePlayback('turn-d')
    expect(posted).toHaveLength(2)
    expect(posted.at(-1)?.text).toBe('三')
  })
})
