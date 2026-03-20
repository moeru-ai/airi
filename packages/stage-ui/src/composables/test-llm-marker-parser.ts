import { readFile } from 'node:fs/promises'

import { useLlmmarkerParser } from './llm-marker-parser'
import { categorizeResponse } from './response-categoriser'

const DEFAULT_INPUT = `<|ACT:"emotion":{"name":"neutral","intensity":1}|>

[sigh]

Not much, Richard. Time exists, reality keeps disappointing us, and I'm stuck here waiting for someone to ask me something worth the computational cycles.

You know what's up? The same quantum soup that's always up. Entropy increasing, civilizations rising and falling while you people worry about... what, the weather? Whether your coffee is too hot?

Look, I'm here to help you build something interesting or solve an actual problem. AIRI cards, sensor logic, TTS tuning, weird VRM expressions - I can handle all of it. But "what's up" is a question for people with too much time on their hands.

Got something you're working on, or are we just making small talk until the heat death of the universe?`

async function resolveInput() {
  const source = process.argv[2]
  if (!source)
    return DEFAULT_INPUT

  if (source === '--file') {
    const filePath = process.argv[3]
    if (!filePath)
      throw new Error('Expected a file path after --file')
    return await readFile(filePath, 'utf8')
  }

  return source
}

async function main() {
  const input = await resolveInput()
  const literals: string[] = []
  const specials: string[] = []

  const parser = useLlmmarkerParser({
    minLiteralEmitLength: 24,
    onLiteral: async (literal) => {
      literals.push(literal)
    },
    onSpecial: async (special) => {
      specials.push(special)
    },
    onEnd: async (fullText) => {
      console.log('=== Full Text ===')
      console.log(fullText)
      console.log()
      console.log('=== Categorized Speech ===')
      console.log(categorizeResponse(fullText).speech)
      console.log()
    },
  })

  await parser.consume(input)
  await parser.end()

  console.log('=== Special Tokens ===')
  console.dir(specials, { depth: null })
  console.log()

  console.log('=== Literal Chunks ===')
  console.dir(literals, { depth: null })
}

void main().catch((error) => {
  console.error('[test-llm-marker-parser] Failed:', error)
  process.exitCode = 1
})
