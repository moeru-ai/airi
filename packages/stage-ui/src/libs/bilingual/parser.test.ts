import { describe, expect, it } from 'vitest'

import { createBilingualParser } from './parser'

interface CapturedChunk {
  code: string
  text: string
}

/** Feeds every chunk through one parser and returns what it routed. */
function collect(languages: string[], chunks: string[]): CapturedChunk[] {
  const captured: CapturedChunk[] = []
  const parser = createBilingualParser({
    languages,
    onText: (language, text) => captured.push({ code: language.code, text }),
  })

  for (const chunk of chunks)
    parser.push(chunk)
  parser.end()

  return captured
}

describe('createBilingualParser', () => {
  it('routes each tagged segment to its own language', () => {
    const captured = collect(['en', 'zh'], ['[EN] Hello\n[CN] 你好'])

    expect(captured).toEqual([
      { code: 'en', text: ' Hello\n' },
      { code: 'zh', text: ' 你好' },
    ])
  })

  it('never lets a tag reach the consumer', () => {
    const captured = collect(['en', 'zh'], ['[EN] Hello\n[CN] 你好'])

    expect(captured.map(chunk => chunk.text).join('')).not.toContain('[EN]')
    expect(captured.map(chunk => chunk.text).join('')).not.toContain('[CN]')
  })

  it('reassembles a tag that is split across chunks', () => {
    const captured = collect(['en', 'zh'], ['[E', 'N] Hello', '[CN] 你好'])

    expect(captured).toEqual([
      { code: 'en', text: ' Hello' },
      { code: 'zh', text: ' 你好' },
    ])
  })

  it('routes untagged output to the first language', () => {
    const captured = collect(['en', 'zh'], ['Hello there'])

    expect(captured).toEqual([{ code: 'en', text: 'Hello there' }])
  })

  it('keeps bracketed text that is not a known tag', () => {
    const captured = collect(['en'], ['[note] hello'])

    expect(captured).toEqual([{ code: 'en', text: '[note] hello' }])
  })

  it('flushes a trailing unfinished tag as literal text', () => {
    const captured = collect(['en', 'zh'], ['Hi [CN'])

    expect(captured).toEqual([
      { code: 'en', text: 'Hi ' },
      { code: 'en', text: '[CN' },
    ])
  })

  it('emits nothing when no language is configured', () => {
    const captured: CapturedChunk[] = []
    const parser = createBilingualParser({
      languages: [],
      onText: (language, text) => captured.push({ code: language.code, text }),
    })

    parser.push('[EN] Hello')
    parser.end()

    expect(captured).toEqual([])
  })
})
