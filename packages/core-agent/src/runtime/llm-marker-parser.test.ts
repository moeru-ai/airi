import { describe, expect, it } from 'vitest'

import { useLlmmarkerParser } from './llm-marker-parser'

/**
 * @example
 * const parser = useLlmmarkerParser({ onLiteral, onSpecial })
 */
describe('useLlmmarkerParser', () => {
  /**
   * @example
   * Plain model text is emitted as literal output.
   */
  it('parses pure literals', async () => {
    const collectedLiterals: string[] = []
    const parser = useLlmmarkerParser({
      onLiteral: (literal) => {
        collectedLiterals.push(literal)
      },
    })

    await parser.consume('Hello, world!')
    await parser.end()

    expect(collectedLiterals.join('')).toBe('Hello, world!')
  })

  /**
   * @example
   * `<|...|>` markers are emitted as special output.
   */
  it('parses special markers separately from literals', async () => {
    const collectedLiterals: string[] = []
    const collectedSpecials: string[] = []
    const parser = useLlmmarkerParser({
      onLiteral: (literal) => {
        collectedLiterals.push(literal)
      },
      onSpecial: (special) => {
        collectedSpecials.push(special)
      },
    })

    await parser.consume('Hello <|ACT|> world')
    await parser.end()

    expect(collectedLiterals.join('')).toBe('Hello  world')
    expect(collectedSpecials).toEqual(['<|ACT|>'])
  })

  /**
   * @example
   * Unfinished markers are withheld instead of leaking into literal text.
   */
  it('does not include unfinished special markers', async () => {
    const collectedLiterals: string[] = []
    const collectedSpecials: string[] = []
    const parser = useLlmmarkerParser({
      onLiteral: (literal) => {
        collectedLiterals.push(literal)
      },
      onSpecial: (special) => {
        collectedSpecials.push(special)
      },
    })

    await parser.consume('<|unfinished')
    await parser.end()

    expect(collectedLiterals).toEqual([])
    expect(collectedSpecials).toEqual([])
  })

  // A flush emits the held text and waits for its handler. Parsing continues after it.
  it('emits the held-back end of the text on flush, and keeps parsing after it', async () => {
    const collectedLiterals: string[] = []
    const parser = useLlmmarkerParser({
      onLiteral: (literal) => {
        collectedLiterals.push(literal)
      },
    })

    await parser.consume('查曼谷和上海未来三天的天气。')
    await parser.flush()
    expect(collectedLiterals.join('')).toBe('查曼谷和上海未来三天的天气。')

    await parser.consume('第 1/3 步完成。')
    await parser.end()
    expect(collectedLiterals.join('')).toBe('查曼谷和上海未来三天的天气。第 1/3 步完成。')
  })

  it('runs a flush transition before text already queued after the boundary', async () => {
    const parts: string[] = []
    let mode = 'source'
    const parser = useLlmmarkerParser({
      onLiteral: (text) => { parts.push(`${mode}:${text}`) },
    })
    void parser.consume('before')
    const boundary = parser.flush(() => {
      mode = 'translation'
    })
    void parser.consume('after')
    await boundary
    await parser.end()
    expect(parts.filter(part => part.startsWith('source:')).map(part => part.slice(7)).join('')).toBe('before')
    expect(parts.filter(part => part.startsWith('translation:')).map(part => part.slice(12)).join('')).toBe('after')
  })
})
