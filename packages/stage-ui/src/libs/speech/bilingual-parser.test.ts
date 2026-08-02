import { describe, expect, it } from 'vitest'

import { BILINGUAL_KNOWN_TAGS, BILINGUAL_TAG_TTS } from '../../stores/modules/bilingual'
import { BilingualStreamParser } from './bilingual-parser'

describe('bilingualStreamParser', () => {
  it('passes through all chunks unchanged when disabled', () => {
    const parser = new BilingualStreamParser({ enabled: false, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })
    const res = parser.feed('[TTS] Hello\n[SUB1] Hello\n[SUB2] 你好')
    expect(res).toEqual({
      ttsChunk: '[TTS] Hello\n[SUB1] Hello\n[SUB2] 你好',
      captionChunk: '[TTS] Hello\n[SUB1] Hello\n[SUB2] 你好',
    })
  })

  it('filters TTS content according to [TTS] role tag when enabled', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('[TTS] Hello world!')
    expect(res1.ttsChunk).toBe(' Hello world!')
    expect(res1.captionChunk).toBe('[TTS] Hello world!')

    const res2 = parser.feed('\n[SUB1] Hello world!\n[SUB2] 你好世界！')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe('\n[SUB1] Hello world!\n[SUB2] 你好世界！')
  })

  it('handles streaming chunks split across tag boundaries', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('[TT')
    expect(res1.ttsChunk).toBe('')
    expect(res1.captionChunk).toBe('[TT')

    const res2 = parser.feed('S] Hello ')
    expect(res2.ttsChunk).toBe(' Hello ')
    expect(res2.captionChunk).toBe('S] Hello ')

    const res3 = parser.feed('there!\n[SUB')
    expect(res3.ttsChunk).toBe('there!\n')
    expect(res3.captionChunk).toBe('there!\n[SUB')

    const res4 = parser.feed('1] Hello there!')
    expect(res4.ttsChunk).toBe('')
    expect(res4.captionChunk).toBe('1] Hello there!')

    const flushRes = parser.flush()
    expect(flushRes.ttsChunk).toBe('')
    expect(flushRes.captionChunk).toBe('')
  })

  it('falls back to reading untagged initial output until a non-matching tag arrives', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('Greeting without tag. ')
    expect(res1.ttsChunk).toBe('Greeting without tag. ')

    const res2 = parser.feed('\n[SUB1] Hello')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe('\n[SUB1] Hello')
  })

  it('treats unknown bracketed words like [AIRI] or [docs] as literal prose, not tag switches', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('[TTS] Welcome to [AIRI] the assistant!')
    expect(res1.ttsChunk).toBe(' Welcome to [AIRI] the assistant!')

    const res2 = parser.feed('\n[SUB1] 欢迎使用！')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe('\n[SUB1] 欢迎使用！')
  })

  it('prevents duplicate language tags from causing double TTS playback when subtitle matches TTS language', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    // [TTS] section in English
    const res1 = parser.feed('[TTS] Hello world!')
    expect(res1.ttsChunk).toBe(' Hello world!')

    // [SUB1] section also in English (same language)
    const res2 = parser.feed('\n[SUB1] Hello world!')
    expect(res2.ttsChunk).toBe('\n') // Subtitle section is NOT routed to TTS

    // [SUB2] section in English (all 3 in English)
    const res3 = parser.feed('\n[SUB2] Hello world!')
    expect(res3.ttsChunk).toBe('') // Translation section is NOT routed to TTS
  })
})
