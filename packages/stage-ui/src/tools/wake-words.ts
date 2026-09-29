import type { Tool } from '@xsai/shared-chat'

import type { useAiriCardStore } from '../stores/modules/airi-card'

import { errorMessageFrom } from '@moeru/std'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { pinnedKwsVocabulary } from '../services/wake-words'

type AiriCardStore = Pick<ReturnType<typeof useAiriCardStore>, 'updateCardWakeWords'>

const matchSchema = z.object({
  tokens: z.array(z.string()).min(1),
  score: z.number().nullable().describe('Use null for the model default.'),
  threshold: z.number().nullable().describe('Use null for the model default.'),
})
const keywordSchema = z.object({
  label: z.string().min(1),
  matches: z.array(matchSchema).min(1),
  score: z.number().nullable().describe('Use null for the model default.'),
  threshold: z.number().nullable().describe('Use null for the model default.'),
})

/**
 * Creates the wake-word editor for one character turn.
 * The captured card ID remains fixed when another character becomes active.
 */
export async function createWakeWordTool(options: {
  cardId: string
  cardStore: AiriCardStore
  getVocabulary: () => Promise<ReadonlySet<string>>
}): Promise<Tool> {
  const { cardId, cardStore, getVocabulary } = options
  return tool({
    name: 'configure_wake_words',
    description: `Replace your own character card wake words. Supply model tokens, not text, pinyin, or phonemes. The same spoken name can have several pronunciations: include every pronunciation as a separate matches entry with its own complete tokens array. Use only these tokens from the configured KWS model: ${[...pinnedKwsVocabulary].join(', ')}. This tool cannot edit another character. If a pronunciation conflicts with another character, explain the conflict to the user in your own words and ask which name they want to use.`,
    parameters: z.object({
      keywords: z.array(keywordSchema).describe('The complete replacement list of wake words for your character. Use an empty list to clear them.'),
    }),
    execute: async ({ keywords }) => {
      const cardKeywords = keywords.map(keyword => ({
        label: keyword.label,
        matches: keyword.matches.map(match => ({
          tokens: match.tokens,
          score: match.score ?? undefined,
          threshold: match.threshold ?? undefined,
        })),
        score: keyword.score ?? undefined,
        threshold: keyword.threshold ?? undefined,
      }))
      let vocabulary: ReadonlySet<string>
      try {
        vocabulary = await getVocabulary()
      }
      catch (error) {
        return { status: 'unavailable' as const, reason: errorMessageFrom(error) }
      }

      try {
        return await cardStore.updateCardWakeWords(cardId, cardKeywords, [...vocabulary])
      }
      catch (error) {
        return { status: 'invalid' as const, reason: errorMessageFrom(error) }
      }
    },
  })
}
