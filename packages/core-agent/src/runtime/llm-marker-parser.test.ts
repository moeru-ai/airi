import { describe, expect, it } from 'vitest'

import { stripLlmControlTokens, useLlmmarkerParser } from './llm-marker-parser'

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
})

describe('stripLlmControlTokens', () => {
  it('removes a canonical ACT token before visible text', () => {
    expect(stripLlmControlTokens('<|ACT {"emotion":{"name":"think","intensity":0.6}}|>Owen…?'))
      .toBe('Owen…?')
  })

  it('removes a legacy ACT token with an outer marker', () => {
    expect(stripLlmControlTokens('<|ACT:{"cognitive":"trying to recall","intent":"answer question"}|>Owen…?'))
      .toBe('Owen…?')
  })

  it('removes a legacy ACT token without outer angle brackets', () => {
    expect(stripLlmControlTokens('|ACT:{"motion":"tilts head gently"}|Owen…?'))
      .toBe('Owen…?')
  })

  it('removes multiple ACT and DELAY tokens without removing text between them', () => {
    expect(stripLlmControlTokens('Before<|ACT {"emotion":"think"}|>between<|DELAY 1|>after'))
      .toBe('Beforebetweenafter')
  })

  it('ignores "|" inside quoted payloads and preserves text after malformed delimiter-like content', () => {
    expect(stripLlmControlTokens('Before<|ACT {"speech":"uses |> inside payload"}|>After'))
      .toBe('BeforeAfter')
  })

  it('removes CALL tokens while preserving surrounding visible text', () => {
    expect(stripLlmControlTokens('Before<|CALL ["chess.play"]|>after'))
      .toBe('Beforeafter')
  })

  it('removes legacy DELAY and CALL colon tokens', () => {
    expect(stripLlmControlTokens('Before<|DELAY:1|>between|CALL:["chess.play"]|after'))
      .toBe('Beforebetweenafter')
  })

  it('removes tokens with malformed JSON without throwing', () => {
    expect(stripLlmControlTokens('Before<|ACT {"emotion":}|>after'))
      .toBe('Beforeafter')
  })

  it('preserves normal visible text that contains no control tokens', () => {
    expect(stripLlmControlTokens('Hello, Owen…?'))
      .toBe('Hello, Owen…?')
  })

  it('returns an empty string when the response contains only control tokens', () => {
    expect(stripLlmControlTokens('<|ACT {"emotion":"think"}|><|DELAY 1|><|CALL ["chess.play"]|>'))
      .toBe('')
  })

  it('strips no-payload markers that should not reach Discord output', () => {
    expect(stripLlmControlTokens('Before<|ACT|><|DELAY|>in between<|CALL|>After'))
      .toBe('Beforein betweenAfter')
  })

  it('suppresses an incomplete recognized token to avoid leaking its metadata', () => {
    expect(stripLlmControlTokens('Before<|ACT {"cognitive":"private"'))
      .toBe('Before')
  })
})
