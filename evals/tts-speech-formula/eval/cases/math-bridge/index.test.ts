import { toSpeechText } from '@proj-airi/core-agent'
import { describe, expect, it } from 'vitest'

import { mathBridgeCases } from '.'
import { leftoverNotation } from '../../evaluators/notation'

describe('mathBridgeCases', () => {
  it('loads the committed sample with unique ids', () => {
    expect(mathBridgeCases.length).toBeGreaterThan(0)
    expect(new Set(mathBridgeCases.map(item => item.id)).size).toBe(mathBridgeCases.length)
  })

  // Runs the rule engine on arXiv notation without any model call. The snapshot lists what it still leaves as
  // notation. `\left\ {` and `\deltat` are artifacts of the MathBridge tokenizer, not notation that a reply writes.
  it('lists the notation that the rule engine leaves in arXiv formulas', () => {
    const leftovers: Record<string, string> = {}
    for (const item of mathBridgeCases) {
      const markdown = item.input as string
      const found = leftoverNotation(toSpeechText(markdown, { language: 'en-US' }), markdown)
      if (found.length > 0)
        leftovers[item.id] = `${item.reference as string} => ${found.join(' ')}`
    }

    expect(leftovers).toMatchInlineSnapshot(`
      {
        "mb-4602321": "\\mathbb { P } \\Gamma\\backslash \\mathbb { CH } ^9 =M => backslash",
      }
    `)
  })
})
