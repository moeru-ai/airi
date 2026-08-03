import { describe, expect, it } from 'vitest'

import { BILINGUAL_KNOWN_TAGS, BILINGUAL_TAG_TTS } from '../../stores/modules/bilingual'
import { BilingualStreamParser, cleanBilingualMessageText } from './bilingual-parser'

describe('bilingualStreamParser', () => {
  it('passes through all chunks unchanged when disabled', () => {
    const parser = new BilingualStreamParser({ enabled: false, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })
    const res = parser.feed('[TTS] Hello\n[SUB1] Hello\n[SUB2] 你好')
    expect(res).toEqual({
      ttsChunk: '[TTS] Hello\n[SUB1] Hello\n[SUB2] 你好',
      captionChunk: '[TTS] Hello\n[SUB1] Hello\n[SUB2] 你好',
    })
  })

  it('filters TTS content according to [TTS] tag and routes [SUB1]/[SUB2] to captionChunk', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('[TTS] Spoken audio text!')
    expect(res1.ttsChunk).toBe(' Spoken audio text!')
    expect(res1.captionChunk).toBe('') // [TTS] section is for audio only

    const res2 = parser.feed('\n[SUB1] Primary subtitle!\n[SUB2] Translated subtitle!')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe(' Primary subtitle!\n Translated subtitle!')
  })

  it('handles streaming chunks split across tag boundaries', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('[TT')
    expect(res1.ttsChunk).toBe('')
    expect(res1.captionChunk).toBe('')

    const res2 = parser.feed('S] Spoken ')
    expect(res2.ttsChunk).toBe(' Spoken ')
    expect(res2.captionChunk).toBe('')

    const res3 = parser.feed('text!\n[SUB')
    expect(res3.ttsChunk).toBe('text!\n')
    expect(res3.captionChunk).toBe('')

    const res4 = parser.feed('1] Subtitle 1 text!')
    expect(res4.ttsChunk).toBe('')
    expect(res4.captionChunk).toBe(' Subtitle 1 text!')

    const flushRes = parser.flush()
    expect(flushRes.ttsChunk).toBe('')
    expect(flushRes.captionChunk).toBe('')
  })

  it('falls back to reading untagged initial output until a tag arrives', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('Greeting without tag. ')
    expect(res1.ttsChunk).toBe('Greeting without tag. ')
    expect(res1.captionChunk).toBe('Greeting without tag. ')

    const res2 = parser.feed('\n[SUB1] Hello')
    expect(res2.ttsChunk).toBe('\n')
    expect(res2.captionChunk).toBe('\n Hello')
  })

  it('treats unknown bracketed words like [AIRI] or [docs] as literal prose', () => {
    const parser = new BilingualStreamParser({ enabled: true, ttsTag: BILINGUAL_TAG_TTS, knownTags: BILINGUAL_KNOWN_TAGS })

    const res1 = parser.feed('[SUB1] Welcome to [AIRI] the assistant!')
    expect(res1.ttsChunk).toBe('')
    expect(res1.captionChunk).toBe(' Welcome to [AIRI] the assistant!')
  })
})

describe('cleanBilingualMessageText', () => {
  it('strips routing tags and removes duplicated TTS text when SUB1 is identical', () => {
    const raw = '[TTS] Hello, how are you today?\n[SUB1] Hello, how are you today?\n[SUB2] 你好，今天过得怎么样？'
    const cleaned = cleanBilingualMessageText(raw)
    expect(cleaned).toBe('Hello, how are you today?\n你好，今天过得怎么样？')
  })

  it('handles distinct TTS, SUB1, and SUB2 languages cleanly', () => {
    const raw = '[TTS] 今日は調子はいかがですか？\n[SUB1] Hello, how are you today?\n[SUB2] 你好，今天过得怎么样？'
    const cleaned = cleanBilingualMessageText(raw)
    expect(cleaned).toBe('Hello, how are you today?\n你好，今天过得怎么样？')
  })

  it('returns text unchanged if no bilingual tags are present', () => {
    const raw = 'Normal assistant message [docs](https://example.com)'
    expect(cleanBilingualMessageText(raw)).toBe('Normal assistant message [docs](https://example.com)')
  })
})
