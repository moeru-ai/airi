import type { Tool } from '@xsai/shared-chat'

import type { useWakeWordsStore } from '../stores/wake-words'

import { describe, expect, it, vi } from 'vitest'

import { kwsModel } from '../libs/voice/kws-model'
import { resolveWakeWords, validateWakeWords } from '../libs/voice/wake-words'
import { createWakeWordTool } from './wake-words'

type SetWords = ReturnType<typeof useWakeWordsStore>['setWords']

const toolOptions = {} as Parameters<Tool['execute']>[1]

/** Validates like the store and resolves conflicts against one other card that already claims `AE1 L IH0 S`. */
function createSetWords() {
  const other = { characterId: 'other', words: [{ text: 'Alice', modelId: kwsModel.id, pronunciations: [['AE1', 'L', 'IH0', 'S']] }] }
  return vi.fn<SetWords>(async (characterId, value, model) => {
    const words = validateWakeWords(value, model)
    const { conflicts } = resolveWakeWords([other, { characterId, words }], {})
    return { status: 'saved' as const, conflicts: conflicts.filter(conflict => conflict.candidates.some(candidate => candidate.characterId === characterId)) }
  })
}

describe('configure_wake_words tool', () => {
  it('edits the captured character with the pinned model and returns conflicts as data', async () => {
    const setWords = createSetWords()
    const agentTool = await createWakeWordTool({ characterId: 'turn-character', setWords })

    const result = await agentTool.execute({ words: [{ text: 'Alice', pronunciations: [['AE1', 'L', 'IH0', 'S'], ['ài', 'l', 'ì', 's', 'ī']] }] }, toolOptions)

    expect(setWords).toHaveBeenCalledWith('turn-character', [{ text: 'Alice', modelId: kwsModel.id, pronunciations: [['AE1', 'L', 'IH0', 'S'], ['ài', 'l', 'ì', 's', 'ī']] }], expect.objectContaining({ id: kwsModel.id }))
    expect(result).toEqual({
      status: 'saved',
      conflicts: [{
        tokens: ['AE1', 'L', 'IH0', 'S'],
        active: false,
        owner: null,
        claimedBy: [{ characterId: 'other', text: 'Alice' }, { characterId: 'turn-character', text: 'Alice' }],
      }],
    })
  })

  it('rejects tokens outside the model vocabulary without saving', async () => {
    const setWords = createSetWords()
    const agentTool = await createWakeWordTool({ characterId: 'turn-character', setWords })

    const result = await agentTool.execute({ words: [{ text: 'Alice', pronunciations: [['alice']] }] }, toolOptions)

    expect(result).toEqual({ status: 'rejected', reason: 'Wake word pronunciation does not match the selected model vocabulary' })
  })

  it('does not offer model control tokens as pronunciations', async () => {
    const agentTool = await createWakeWordTool({ characterId: 'turn-character', setWords: createSetWords() })

    expect(agentTool.function.description).toContain('AE1')
    expect(agentTool.function.description).not.toContain('<unk>')
    expect(agentTool.function.parameters).toMatchObject({
      type: 'object',
      required: ['words'],
      properties: { words: { items: { required: expect.arrayContaining(['text', 'pronunciations']) } } },
    })
  })
})
