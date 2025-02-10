import { describe, expect, it } from 'vitest'

import { useLlmmarkerParser } from './llmmarkerParser'

describe('useLlmmarkerParser', async () => {
  it('should parse pure literals', async () => {
    const fullText = 'Hello, world!'
    const collectedLiterals: string[] = []
    const collectedSpecials: string[] = []

    const parser = useLlmmarkerParser({
      onLiteral(literal) {
        collectedLiterals.push(literal)
      },
      onSpecial(special) {
        collectedSpecials.push(special)
      },
    })

    for (const char of fullText) {
      await parser.consume(char)
    }

    await parser.end()

    expect(collectedLiterals).toEqual('Hello, world!'.split(''))
    expect(collectedSpecials).toEqual([])
  })

  it('should parse pure specials', async () => {
    const fullText = '<|Hello, world!|>'
    const collectedLiterals: string[] = []
    const collectedSpecials: string[] = []

    const parser = useLlmmarkerParser({
      onLiteral(literal) {
        collectedLiterals.push(literal)
      },
      onSpecial(special) {
        collectedSpecials.push(special)
      },
    })

    for (const char of fullText) {
      await parser.consume(char)
    }

    await parser.end()

    expect(collectedLiterals).toEqual([])
    expect(collectedSpecials).toEqual(['<|Hello, world!|>'])
  })

  it('should not include unfinished special', async () => {
    const fullText = '<|Hello, world'
    const collectedLiterals: string[] = []
    const collectedSpecials: string[] = []

    const parser = useLlmmarkerParser({
      onLiteral(literal) {
        collectedLiterals.push(literal)
      },
      onSpecial(special) {
        collectedSpecials.push(special)
      },
    })

    for (const char of fullText) {
      await parser.consume(char)
    }

    await parser.end()

    expect(collectedLiterals).toEqual([])
    expect(collectedSpecials).toEqual([])
  })

  it('should parse with mixed input, ends with special', async () => {
    const fullText = 'This is sentence 1, <|HELLO|> and this is sentence 2.<|WORLD|>'
    const collectedLiterals: string[] = []
    const collectedSpecials: string[] = []

    const parser = useLlmmarkerParser({
      onLiteral(literal) {
        collectedLiterals.push(literal)
      },
      onSpecial(special) {
        collectedSpecials.push(special)
      },
    })

    for (const char of fullText) {
      await parser.consume(char)
    }

    await parser.end()

    expect(collectedLiterals).toEqual([...'This is sentence 1, '.split(''), ...' and this is sentence 2.'.split('')])
    expect(collectedSpecials).toEqual(['<|HELLO|>', '<|WORLD|>'])
  })

  it('should parse correctly', async () => {
    const testCases: { input: string, expectedLiterals: string[], expectedSpecials: string[] }[] = [
      {
        input: `<|A|> Wow, hello there!`,
        expectedLiterals: ' Wow, hello there!'.split(''),
        expectedSpecials: ['<|A|>'],
      },
      {
        input: `<|A|> Hello!`,
        expectedLiterals: ' Hello!'.split(''),
        expectedSpecials: ['<|A|>'],
      },
      {
        input: `<|A|> Hello! <|B|>`,
        expectedLiterals: ' Hello! '.split(''),
        expectedSpecials: ['<|A|>', '<|B|>'],
      },
    ]

    for (const tc of testCases) {
      const { input, expectedLiterals, expectedSpecials } = tc
      const collectedLiterals: string[] = []
      const collectedSpecials: string[] = []

      const parser = useLlmmarkerParser({
        onLiteral(literal) {
          collectedLiterals.push(literal)
        },
        onSpecial(special) {
          collectedSpecials.push(special)
        },
      })

      for (const char of input) {
        await parser.consume(char)
      }

      await parser.end()

      expect(collectedLiterals).toEqual(expectedLiterals)
      expect(collectedSpecials).toEqual(expectedSpecials)
    }
  })
})
