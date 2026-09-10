import { describe, expect, it } from 'vitest'

import { createBilingualParser, projectBilingualText } from './parser'

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

  it('accepts the catalogue tag in either letter case', () => {
    const captured = collect(['en', 'zh'], ['[en] Hello[cn] 你好'])

    expect(captured).toEqual([
      { code: 'en', text: ' Hello' },
      { code: 'zh', text: ' 你好' },
    ])
  })

  // One spelling per language: the tag the prompt teaches. A model that invents
  // another one keeps it as literal text, so the mistake is visible in the
  // caption instead of moving the segment to a line nothing was asked for.
  it('keeps a tag outside the catalogue as literal text', () => {
    for (const tag of ['ZH', 'ZH-CN', 'CHINESE', '中文']) {
      const captured = collect(['en', 'zh'], [`[EN] Hello[${tag}] 你好`])

      expect(captured, tag).toEqual([{ code: 'en', text: ` Hello[${tag}] 你好` }])
    }
  })

  it('leaves a tag for an unconfigured language as literal text', () => {
    const captured = collect(['en', 'zh'], ['[EN] Hello[JA] こんにちは'])

    expect(captured).toEqual([{ code: 'en', text: ' Hello[JA] こんにちは' }])
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

describe('projectBilingualText', () => {
  // Stored chat history is never parsed for captions, so it must not keep the
  // control tags.
  it('keeps only the requested language and drops every tag', () => {
    const projected = projectBilingualText('[EN] Hello\n[CN] 你好', ['en', 'zh'], 'en')

    expect(projected).toBe(' Hello\n')
    expect(projected).not.toContain('[EN]')
    expect(projected).not.toContain('[CN]')
  })

  it('keeps the translation when that is the requested language', () => {
    expect(projectBilingualText('[EN] Hello\n[CN] 你好', ['en', 'zh'], 'zh')).toBe(' 你好')
  })

  it('leaves untagged text untouched', () => {
    expect(projectBilingualText('Hello there', ['en', 'zh'], 'en')).toBe('Hello there')
  })
})
