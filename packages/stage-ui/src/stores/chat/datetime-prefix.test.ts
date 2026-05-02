import { describe, expect, it } from 'vitest'

import { createTimestampPrefixStripper, formatTimePrefix } from './datetime-prefix'

describe('formatTimePrefix', () => {
  it('wraps `[YYYY-MM-DD HH:MM]` with trailing space', () => {
    const ts = new Date(2026, 3, 25, 18, 47, 0).getTime()
    expect(formatTimePrefix(ts)).toBe('[2026-04-25 18:47] ')
  })

  it('zero-pads month, day, hour, minute', () => {
    const ts = new Date(2026, 0, 5, 3, 7, 0).getTime() // 5 January 2026, 03:07 local
    expect(formatTimePrefix(ts)).toBe('[2026-01-05 03:07] ')
  })

  it('produces stable output for the same input (cache-friendly)', () => {
    const ts = new Date(2026, 3, 25, 18, 47, 0).getTime()
    expect(formatTimePrefix(ts)).toBe(formatTimePrefix(ts))
  })

  it('produces different output across day boundaries (lets the model see day changes)', () => {
    const day1 = new Date(2026, 3, 25, 12, 0, 0).getTime()
    const day2 = new Date(2026, 3, 26, 12, 0, 0).getTime()
    expect(formatTimePrefix(day1)).not.toBe(formatTimePrefix(day2))
    expect(formatTimePrefix(day1)).toContain('2026-04-25')
    expect(formatTimePrefix(day2)).toContain('2026-04-26')
  })

  it('shares the same prefix across timestamps in the same minute (KV-cache stable)', () => {
    const a = new Date(2026, 3, 25, 18, 47, 12).getTime()
    const b = new Date(2026, 3, 25, 18, 47, 58).getTime()
    expect(formatTimePrefix(a)).toBe(formatTimePrefix(b))
  })
})

// ROOT CAUSE:
//
// Weak local models echo the `[YYYY-MM-DD HH:MM] ` prefix that
// `formatTimePrefix` injects onto every user/assistant turn (see
// chat.ts:351,356). The echoed prefix then leaked into both the chat
// transcript (buildingMessage.content) and the TTS pipeline
// (hooks.emitTokenLiteralHooks), so the synthesized voice would read
// "bracket twenty twenty six dash zero five..." aloud before the actual
// reply. We strip it at the streaming boundary in chat.ts onLiteral so
// neither the rendered transcript nor the audio contains it.
describe('createTimestampPrefixStripper', () => {
  it('strips a leading `[YYYY-MM-DD HH:MM] ` prefix delivered as one chunk', () => {
    const stripper = createTimestampPrefixStripper()
    expect(stripper.consume('[2026-05-01 20:08] ooh nice')).toBe('ooh nice')
    expect(stripper.consume(', mining is fun')).toBe(', mining is fun')
    expect(stripper.end()).toBe('')
  })

  it('strips a leading prefix split across many small chunks (real streaming case)', () => {
    const stripper = createTimestampPrefixStripper()
    const chunks = ['[', '202', '6-', '05-', '01 ', '20:', '08', '] ', 'hello', ' world']
    const out = chunks.map(c => stripper.consume(c)).join('')
    expect(out).toBe('hello world')
  })

  it('strips when the trailing space arrives in the same chunk as content', () => {
    const stripper = createTimestampPrefixStripper()
    expect(stripper.consume('[2026-05-01 20:08]')).toBe('')
    expect(stripper.consume(' actual reply')).toBe('actual reply')
  })

  it('does not strip when no prefix is present (passthrough)', () => {
    const stripper = createTimestampPrefixStripper()
    expect(stripper.consume('hello there')).toBe('hello there')
    expect(stripper.consume(' more text')).toBe(' more text')
  })

  it('does not strip when the response merely starts with `[` but is not a timestamp', () => {
    const stripper = createTimestampPrefixStripper()
    expect(stripper.consume('[note] not a timestamp')).toBe('[note] not a timestamp')
  })

  it('does not strip a timestamp that appears mid-response (only leading prefixes)', () => {
    const stripper = createTimestampPrefixStripper()
    expect(stripper.consume('Earlier: ')).toBe('Earlier: ')
    expect(stripper.consume('[2026-05-01 20:08] keep this')).toBe('[2026-05-01 20:08] keep this')
  })

  it('handles a prefix without a trailing space', () => {
    const stripper = createTimestampPrefixStripper()
    expect(stripper.consume('[2026-05-01 20:08]immediately')).toBe('immediately')
  })

  it('flushes buffered partial-prefix bytes if the stream ends before the prefix completes', () => {
    const stripper = createTimestampPrefixStripper()
    expect(stripper.consume('[2026-')).toBe('')
    expect(stripper.end()).toBe('[2026-')
  })

  it('rejects an almost-prefix where a non-digit appears in a digit slot', () => {
    const stripper = createTimestampPrefixStripper()
    // `[2026-XX...` — `X` is not a digit, so this is not the timestamp shape.
    expect(stripper.consume('[2026-XX-01 20:08] body')).toBe('[2026-XX-01 20:08] body')
  })
})
