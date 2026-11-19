import { toSpeechText } from '@proj-airi/core-agent'
import { describe, expect, it } from 'vitest'

import { formulaSpeechCases, languages, voiceLanguage } from '../../../cases/formula-speech'
import { leftoverNotation } from '../../../evaluators/notation'

describe('rule read-aloud', () => {
  // Runs the rule engine on every case, without TTS or ASR, so it costs nothing.
  // The snapshot lists the notation that the rule engine still hands to TTS. Fix the rule engine to shrink it.
  it('lists the notation that the rule engine leaves in the spoken text', () => {
    const leftovers: Record<string, string> = {}
    for (const item of formulaSpeechCases) {
      for (const language of languages) {
        const markdown = typeof item.input === 'string' ? item.input : item.input[language]
        const found = leftoverNotation(toSpeechText(markdown, { language: voiceLanguage[language] }), markdown)
        if (found.length > 0)
          leftovers[`${item.id}|${language}`] = found.join(' ')
      }
    }

    expect(leftovers).toMatchInlineSnapshot(`{}`)
  })
})
