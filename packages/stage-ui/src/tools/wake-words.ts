import type { Tool } from '@xsai/shared-chat'

import type { useWakeWordsStore } from '../stores/wake-words'

import { errorMessageFrom } from '@moeru/std'
import { tool } from '@xsai/tool'
import { array, description, minLength, pipe, strictObject, string } from 'valibot'

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
export const WAKE_WORDS_TOOL_NAME = 'configure_wake_words'

export async function createWakeWordTool(options: { characterId: string, setWords: SetWords }): Promise<Tool> {
  const { characterId, setWords } = options

  return tool({
    name: WAKE_WORDS_TOOL_NAME,
    description: [
      'Replace the wake words that let the user call you by voice. This tool edits only your own character card.',
      'Each word needs its written text and one or more pronunciations. A pronunciation is a complete list of model tokens, not plain text or whole pinyin syllables.',
      'English uses ARPAbet phones with stress digits, as in the CMU pronouncing dictionary. Write every consonant: "hey" is HH EY1, not EY1.',
      'Chinese uses the pinyin initial and the toned final of each syllable as separate tokens: 嘿一噜 is h ēi y ī l ū, and 爱 is ài.',
      'Write one tone for each syllable. Detection also accepts the other tones of each final, because people change tones when they call a name.',
      'Detection is more reliable for Chinese tokens. When a name can be said as Chinese syllables, also add a pinyin pronunciation.',
      'Add a separate pronunciation for each way the user can say the same word. For a short English name, also try L for R, for example IY1 L UW0 and IY1 R UW1.',
      `Use only these tokens: ${[...kwsVocabulary].join(' ')}.`,
      'If the result reports conflicts, explain in your own words that another character uses the same pronunciation, and ask the user which character must answer to it.',
    ].join(' '),
    // Strict tool schemas need `additionalProperties: false` on every object, nested ones included.
    parameters: strictObject({
      words: pipe(array(strictObject({
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
