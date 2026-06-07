import { describe, expect, it } from 'vitest'

import { createStopScanner } from './stop'

const STOPS = ['\n\nUser:', '\nUser:', '\n\nAssistant:', '\nAssistant:', '\n\nSystem:', '\nSystem:']

describe('createStopScanner', () => {
  it('passes through text with no stop sequence', () => {
    // @example s.push('Hello world') -> 'Hello world'
    const s = createStopScanner(STOPS)
    expect(s.push('Hello world')).toBe('Hello world')
    expect(s.stopped).toBe(false)
    expect(s.flush()).toBe('')
  })

  // ROOT CAUSE:
  //
  // The web-rwkv generate loop only stopped on the end-of-text token (token 0),
  // which RWKV "World"/G1 chat models rarely emit mid-conversation. With no stop
  // sequence the model continued past its reply and hallucinated a "\n\nUser:"
  // turn followed by its own "\n\nAssistant:" turn until maxTokens — and that
  // garbage was stored and fed back, so turn 2 onward degraded.
  //
  // We fixed this by scanning the decoded stream for the role markers the model
  // is actually trained to stop at, halting and trimming at the first match.
  it('halts at a role marker and trims it from the output (Issue: RWKV second-turn degradation)', () => {
    const s = createStopScanner(STOPS)
    expect(s.push('The answer is 42.')).toBe('The answer is 42.')
    expect(s.push('\n\nUser: what about 43?')).toBe('')
    expect(s.stopped).toBe(true)
  })

  // ROOT CAUSE:
  //
  // The stop list only held the blank-line forms ('\n\nUser:' etc.), but the tiny
  // 0.1B RWKV-7 G1 model emits the next role marker after a *single* newline (and
  // after some preamble), e.g. "Programming Language: Python\nUser: Hi! …". None of
  // the '\n\n…' stops matched, so generation never halted and the whole
  // hallucinated User/Assistant dialogue was emitted until maxTokens.
  //
  // We fixed this by also listing the single-newline forms ('\nUser:' etc.) so the
  // scanner halts at the model's actual single-newline turn boundary too.
  it('halts at a single-newline role marker the small model hallucinates', () => {
    const s = createStopScanner(STOPS)
    expect(s.push('Programming Language: Python')).toBe('Programming Language: Python')
    expect(s.push('\nUser: Hi! I\'m a user')).toBe('')
    expect(s.stopped).toBe(true)
  })

  it('detects a stop sequence split across token boundaries without emitting a partial match', () => {
    // The decode that produced "\n\n" must not be emitted, since it may grow into
    // "\n\nUser:" on the next token — which is exactly what happens here.
    const s = createStopScanner(STOPS)
    expect(s.push('Hi there')).toBe('Hi there')
    expect(s.push('\n\n')).toBe('') // held back: could become a stop
    expect(s.push('User:')).toBe('') // completes the stop
    expect(s.stopped).toBe(true)
  })

  it('releases a held-back tail that turns out not to be a stop sequence', () => {
    const s = createStopScanner(STOPS)
    expect(s.push('done')).toBe('done')
    expect(s.push('\n\n')).toBe('') // ambiguous: prefix of "\n\nUser:" etc.
    // Real content follows instead of a role marker, so the held "\n\n" is released.
    expect(s.push('and more')).toBe('\n\nand more')
    expect(s.stopped).toBe(false)
  })

  it('cuts at the earliest stop sequence when more than one is present', () => {
    const s = createStopScanner(STOPS)
    expect(s.push('reply\n\nAssistant: x\n\nUser: y')).toBe('reply')
    expect(s.stopped).toBe(true)
  })

  it('flush releases the held-back tail at natural end of generation', () => {
    const s = createStopScanner(STOPS)
    expect(s.push('bye')).toBe('bye')
    expect(s.push('\n')).toBe('') // single newline: still a possible stop prefix
    expect(s.flush()).toBe('\n')
  })

  it('emits nothing further once stopped', () => {
    const s = createStopScanner(STOPS)
    s.push('x\n\nUser:')
    expect(s.stopped).toBe(true)
    expect(s.push(' more text')).toBe('')
    expect(s.flush()).toBe('')
  })
})
