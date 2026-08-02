import { describe, expect, it } from 'vitest'

import { BilingualStreamParser } from './bilingual-parser'

const KNOWN_TAGS = ['[EN]', '[ZH]', '[JA]', '[ES]', '[FR]', '[DE]', '[KO]', '[RU]', '[PT]', '[IT]']

describe('bilingualStreamParser', () => {
  it('passes through all chunks unchanged when disabled', () => {
    const parser = new BilingualStreamParser({ enabled: false, ttsTag: '[EN]', knownTags: KNOWN_TAGS })
    const res = parser.feed('[EN] Hello\n[ZH] 你好')
    expect(res).toEqual({
      ttsChunk: '[EN] Hello\n[ZH] 你好',
      captionChunk: '[EN] Hello\n[ZH] 你好',
    })
  })

  it('filters TTS content according to matching language tag when enabled', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: '[EN]', knownTags: KNOWN_TAGS })

    const res1 = parser.feed('[EN] Hello world!')
    expect(res1.ttsChunk).toBe(' Hello world!')
    expect(res1.captionChunk).toBe('[EN] Hello world!')

    const res2 = parser.feed('\n[ZH] 你好世界！')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe('\n[ZH] 你好世界！')
  })

  it('handles streaming chunks split across tag boundaries', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: '[EN]', knownTags: KNOWN_TAGS })

    const res1 = parser.feed('[E')
    expect(res1.ttsChunk).toBe('')
    expect(res1.captionChunk).toBe('[E')

    const res2 = parser.feed('N] Hello ')
    expect(res2.ttsChunk).toBe(' Hello ')
    expect(res2.captionChunk).toBe('N] Hello ')

    const res3 = parser.feed('there!\n[Z')
    expect(res3.ttsChunk).toBe('there!\n')
    expect(res3.captionChunk).toBe('there!\n[Z')

    const res4 = parser.feed('H] 你好')
    expect(res4.ttsChunk).toBe('')
    expect(res4.captionChunk).toBe('H] 你好')

    const flushRes = parser.flush()
    expect(flushRes.ttsChunk).toBe('')
    expect(flushRes.captionChunk).toBe('')
  })

  it('falls back to reading untagged initial output until a non-matching tag arrives', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: '[EN]', knownTags: KNOWN_TAGS })

    const res1 = parser.feed('Greeting without tag. ')
    expect(res1.ttsChunk).toBe('Greeting without tag. ')

    const res2 = parser.feed('\n[ZH] 你好')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe('\n[ZH] 你好')
  })

  it('treats unknown bracketed words like [AIRI] or [docs] as literal prose, not tag switches', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: '[EN]', knownTags: KNOWN_TAGS })

    // [EN] section starts, then [AIRI] should NOT switch sections
    const res1 = parser.feed('[EN] Welcome to [AIRI] the assistant!')
    expect(res1.ttsChunk).toBe(' Welcome to [AIRI] the assistant!')

    // [ZH] is a known tag — should switch off TTS
    const res2 = parser.feed('\n[ZH] 欢迎使用！')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe('\n[ZH] 欢迎使用！')
  })
})
