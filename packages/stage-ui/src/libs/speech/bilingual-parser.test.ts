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

  it('filters TTS content and strips routing tags from captionChunk when enabled', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('[TTS] Hello world!')
    expect(res1.ttsChunk).toBe(' Hello world!')
    expect(res1.captionChunk).toBe(' Hello world!') // [TTS] tag is stripped!

    const res2 = parser.feed('\n[SUB1] Hello world!\n[SUB2] 你好世界！')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe('\n Hello world!\n 你好世界！') // [SUB1] and [SUB2] tags are stripped!
  })

  it('handles streaming chunks split across tag boundaries without leaving tags in captionChunk', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('[TT')
    expect(res1.ttsChunk).toBe('')
    expect(res1.captionChunk).toBe('')

    const res2 = parser.feed('S] Hello ')
    expect(res2.ttsChunk).toBe(' Hello ')
    expect(res2.captionChunk).toBe(' Hello ')

    const res3 = parser.feed('there!\n[SUB')
    expect(res3.ttsChunk).toBe('there!\n')
    expect(res3.captionChunk).toBe('there!\n')

    const res4 = parser.feed('1] Hello there!')
    expect(res4.ttsChunk).toBe('')
    expect(res4.captionChunk).toBe(' Hello there!')

    const flushRes = parser.flush()
    expect(flushRes.ttsChunk).toBe('')
    expect(flushRes.captionChunk).toBe('')
  })

  it('falls back to reading untagged initial output until a non-matching tag arrives', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('Greeting without tag. ')
    expect(res1.ttsChunk).toBe('Greeting without tag. ')
    expect(res1.captionChunk).toBe('Greeting without tag. ')

    const res2 = parser.feed('\n[SUB1] Hello')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe('\n Hello')
  })

  it('treats unknown bracketed words like [AIRI] or [docs] as literal prose, not tag switches', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('[TTS] Welcome to [AIRI] the assistant!')
    expect(res1.ttsChunk).toBe(' Welcome to [AIRI] the assistant!')
    expect(res1.captionChunk).toBe(' Welcome to [AIRI] the assistant!')

    const res2 = parser.feed('\n[SUB1] 欢迎使用！')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe('\n 欢迎使用！')
  })

  it('prevents duplicate language tags from causing double TTS playback when subtitle matches TTS language', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    // [TTS] section in English
    const res1 = parser.feed('[TTS] Hello world!')
    expect(res1.ttsChunk).toBe(' Hello world!')
    expect(res1.captionChunk).toBe(' Hello world!')

    // [SUB1] section also in English (same language)
    const res2 = parser.feed('\n[SUB1] Hello world!')
    expect(res2.ttsChunk).toBe('\n') // Subtitle section is NOT routed to TTS
    expect(res2.captionChunk).toBe('\n Hello world!')

    // [SUB2] section in English (all 3 in English)
    const res3 = parser.feed('\n[SUB2] Hello world!')
    expect(res3.ttsChunk).toBe('') // Translation section is NOT routed to TTS
    expect(res3.captionChunk).toBe('\n Hello world!')
  })
})
