import type { TextSegment, TextToken } from '../types'
import type { TtsInputChunkOptions } from './tts-chunker'

import { describe, expect, it, vi } from 'vitest'

import { createSpeechPipeline } from '../speech-pipeline'
import { createTtsSegmentStream } from './tts-chunker'

async function collectSegments(tokens: Pick<TextToken, 'type' | 'value'>[], options?: TtsInputChunkOptions) {
  const input = new ReadableStream<TextToken>({
    start(controller) {
      for (const [sequence, token] of tokens.entries()) {
        controller.enqueue({
          ...token,
          streamId: 'stream',
          intentId: 'intent',
          sequence,
          createdAt: Date.now(),
        })
      }
      controller.close()
    },
  })
  const segments: TextSegment[] = []
  for await (const segment of createTtsSegmentStream(input, { streamId: 'stream', intentId: 'intent' }, { stripEmoji: true, ...options }))
    segments.push(segment)
  return segments
}

describe('opt-in emoji filtering at the speech boundary', () => {
  // ROOT CAUSE:
  //
  // The chunk emitter removed only internal control characters. Callers could not
  // filter emoji without handling split graphemes and special-token boundaries themselves.
  // Opt-in cleaning of final chunks keeps the raw chunker and default behavior unchanged.
  it('preserves emoji when filtering is disabled or omitted', async () => {
    const tokens = new ReadableStream<TextToken>({
      start(controller) {
        controller.enqueue({ type: 'literal', value: '你好👩‍💻👍🏽！', streamId: 'stream', intentId: 'intent', sequence: 0, createdAt: Date.now() })
        controller.close()
      },
    })
    const segments: TextSegment[] = []
    for await (const segment of createTtsSegmentStream(tokens, { streamId: 'stream', intentId: 'intent' }))
      segments.push(segment)
    const disabled = await collectSegments([{ type: 'literal', value: '你好👩‍💻👍🏽！' }], { stripEmoji: false })

    expect(segments.map(segment => segment.text).join('')).toBe('你好👩‍💻👍🏽！')
    expect(disabled.map(segment => segment.text).join('')).toBe('你好👩‍💻👍🏽！')
  })

  it('removes emoji from the final speech text', async () => {
    const segments = await collectSegments([{ type: 'literal', value: '你好😊👍🏽！' }])

    expect(segments.map(segment => segment.text).join('')).toBe('你好！')
  })

  it('removes whole ZWJ, flag, and tag sequences', async () => {
    const segments = await collectSegments([{ type: 'literal', value: 'hello👩‍💻🇨🇳🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}!' }])

    expect(segments.map(segment => segment.text).join('')).toBe('hello!')
  })

  it('preserves the base characters of keycaps', async () => {
    const segments = await collectSegments([{ type: 'literal', value: '选择1️⃣或2⃣，按#️⃣或*️⃣。' }])

    expect(segments.map(segment => segment.text).join('')).toBe('选择1或2，按#或*。')
  })

  it('handles emoji sequences split across literal tokens', async () => {
    const tokens = Array.from('你好👩‍💻👍🏽🇨🇳1️⃣！', value => ({ type: 'literal' as const, value }))
    const segments = await collectSegments(tokens)

    expect(segments.map(segment => segment.text).join('')).toBe('你好1！')
  })

  it('does not emit an empty speech segment for emoji-only text', async () => {
    const segments = await collectSegments([{ type: 'literal', value: '😊👩‍💻' }])

    expect(segments).toEqual([])
  })

  it('keeps special-token ordering after emoji-only chunks', async () => {
    const segments = await collectSegments([
      { type: 'literal', value: '😊' },
      { type: 'special', value: 'first' },
      { type: 'literal', value: 'hello👩‍💻' },
      { type: 'special', value: 'second' },
      { type: 'literal', value: '👍🏽' },
      { type: 'flush' },
      { type: 'literal', value: 'world' },
    ])

    expect(segments.map(segment => [segment.text, segment.special])).toEqual([
      ['', 'first'],
      ['hello', 'second'],
      ['world', null],
    ])
    expect(segments.every(segment => segment.streamId === 'stream')).toBe(true)
    expect(segments.every(segment => segment.intentId === 'intent')).toBe(true)
  })

  it('preserves plain symbols, digits, and text presentation', async () => {
    const text = '© ® ™ ♥ ☀ ☔︎ 123 # *'
    const segments = await collectSegments([{ type: 'literal', value: text }])

    expect(segments.map(segment => segment.text).join('')).toBe(text)
  })

  it('removes symbols with explicit emoji presentation', async () => {
    const segments = await collectSegments([{ type: 'literal', value: 'hello©️♥️☀️!' }])

    expect(segments.map(segment => segment.text).join('')).toBe('hello!')
  })

  it('preserves combining marks and non-emoji joiners', async () => {
    const text = 'ดึกป่านนี้ é क्‍ष 09:05 1~2 snake_case'
    const segments = await collectSegments([{ type: 'literal', value: text }], { boost: 0 })

    expect(segments.map(segment => segment.text).join('')).toBe(text)
  })

  it('keeps internal spaces instead of joining words around a removed emoji', async () => {
    const segments = await collectSegments([{ type: 'literal', value: 'hello  👩‍💻 world!' }])

    expect(segments.map(segment => segment.text).join('')).toBe('hello   world!')
  })

  it('keeps the existing narrative options', async () => {
    const tokens: Pick<TextToken, 'type' | 'value'>[] = [{ type: 'literal', value: 'hello[sigh]😊!' }]
    const stripped = await collectSegments(tokens, { stripNarrative: true })
    const kept = await collectSegments(tokens, { stripNarrative: true, keepNarrativeText: true })

    expect(stripped.map(segment => segment.text).join('')).toBe('hello!')
    expect(kept.map(segment => segment.text).join('')).toBe('hellosigh!')
  })

  it.each([true, false])('applies the configured filter to the TTS request (stripEmoji=%s)', async (stripEmoji) => {
    const tts = vi.fn().mockResolvedValue(null)
    const pipeline = createSpeechPipeline<string>({
      tts,
      segmenter: (tokens, meta) => createTtsSegmentStream(tokens, meta, { stripEmoji }),
      playback: {
        schedule: vi.fn(),
        stopAll: vi.fn(),
        stopByIntent: vi.fn(),
        stopByOwner: vi.fn(),
        onStart: vi.fn(),
        onEnd: vi.fn(),
        onInterrupt: vi.fn(),
        onReject: vi.fn(),
      },
    })
    const finished = new Promise<void>((resolve) => {
      pipeline.on('onIntentEnd', () => resolve())
    })
    const intent = pipeline.openIntent()
    intent.writeLiteral('你好😊！')
    intent.end()
    await finished

    expect(tts).toHaveBeenCalledTimes(1)
    expect(tts.mock.calls[0]?.[0].text).toBe(stripEmoji ? '你好！' : '你好😊！')
  })
})
