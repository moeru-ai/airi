import type { Tool } from '@xsai/shared-chat'

import type { useWakeWordsStore } from '../stores/wake-words'

import { errorMessageFrom } from '@moeru/std'
import { tool } from '@xsai/tool'
import { array, description, minLength, object, pipe, string } from 'valibot'

import { kwsVocabulary, kwsVocabularyModel } from '../libs/voice/kws-model'

type SetWords = ReturnType<typeof useWakeWordsStore>['setWords']

/**
 * Creates the wake word editor for one character turn.
 *
 * The tool edits only `characterId`, which the caller captures from the turn's session before the request starts.
 * A later change of the active character cannot redirect the edit. The result is data for the character to explain:
 * - `saved`: the card stores the list. `conflicts` names each pronunciation that another character also claims.
 *   A conflicting pronunciation stays paused until the user chooses its owner on this device.
 * - `rejected`: the card did not change. `reason` explains why, for example a token outside the model vocabulary.
 */
export async function createWakeWordTool(options: { characterId: string, setWords: SetWords }): Promise<Tool> {
  const { characterId, setWords } = options

  return tool({
    name: 'configure_wake_words',
    description: [
      'Replace the wake words that let the user call you by voice. This tool edits only your own character card.',
      'Each word needs its written text and one or more pronunciations. A pronunciation is a complete list of model tokens, not text, pinyin, or phonemes.',
      'Add a separate pronunciation for each way the user can say the same word.',
      `Use only these tokens: ${[...kwsVocabulary].join(' ')}.`,
      'If the result reports conflicts, explain in your own words that another character uses the same pronunciation, and ask the user which character must answer to it.',
    ].join(' '),
    parameters: object({
      words: pipe(array(object({
        text: pipe(string(), minLength(1), description('The written wake word, for example the character name.')),
        pronunciations: pipe(array(pipe(array(string()), minLength(1))), minLength(1), description('Each item is the complete token sequence of one pronunciation.')),
      })), description('The complete replacement list. Use an empty list to remove all wake words.')),
    }),
    execute: async ({ words }) => {
      try {
        const result = await setWords(characterId, words.map(word => ({ ...word, modelId: kwsVocabularyModel.id })), kwsVocabularyModel)
        return {
          status: result.status,
          conflicts: result.conflicts.map(conflict => ({
            tokens: conflict.candidates[0]?.tokens ?? [],
            active: conflict.owner === characterId,
            owner: conflict.owner ?? null,
            claimedBy: conflict.candidates.map(candidate => ({ characterId: candidate.characterId, text: candidate.text })),
          })),
        }
      }
      catch (error) {
        return { status: 'rejected' as const, reason: errorMessageFrom(error) ?? 'Wake words were not saved' }
      }
    },
  })
}
