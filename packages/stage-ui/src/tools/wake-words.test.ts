import type { Tool } from '@xsai/shared-chat'

import { describe, expect, it, vi } from 'vitest'

import { createWakeWordTool } from './wake-words'

describe('wake word agent tool', () => {
  it('publishes a strict schema for nested pronunciations', async () => {
    const agentTool = await createWakeWordTool({
      cardId: 'turn-character',
      cardStore: { updateCardWakeWords: vi.fn() },
      getVocabulary: async () => new Set(['HELLO']),
    })

    expect(agentTool.function.parameters).toMatchObject({
      properties: {
        keywords: {
          items: {
            properties: {
              matches: {
                items: {
                  required: expect.arrayContaining(['tokens', 'score', 'threshold']),
                },
              },
            },
            required: expect.arrayContaining(['label', 'matches', 'score', 'threshold']),
          },
        },
      },
    })
  })

  it('edits only the card captured for the current turn and returns conflicts to the agent', async () => {
    const updateCardWakeWords = vi.fn(async () => ({
      status: 'conflict' as const,
      conflicts: [{ cardId: 'other', cardName: 'Other', keyword: 'Hello', sequence: 'HELLO' }],
    }))
    const getVocabulary = vi.fn(async () => new Set(['HELLO']))
    const agentTool = await createWakeWordTool({
      cardId: 'turn-character',
      cardStore: { updateCardWakeWords },
      getVocabulary,
    })

    const result = await agentTool.execute({ keywords: [{ label: 'Hello', matches: [{ tokens: ['HELLO'], score: null, threshold: null }], score: null, threshold: null }] }, {} as Parameters<Tool['execute']>[1])

    expect(getVocabulary).toHaveBeenCalledOnce()
    expect(updateCardWakeWords).toHaveBeenCalledWith('turn-character', [{ label: 'Hello', matches: [{ tokens: ['HELLO'], score: undefined, threshold: undefined }], score: undefined, threshold: undefined }], ['HELLO'])
    expect(result).toEqual({
      status: 'conflict',
      conflicts: [{ cardId: 'other', cardName: 'Other', keyword: 'Hello', sequence: 'HELLO' }],
    })
    expect(agentTool.function.description).toContain('every pronunciation as a separate matches entry')
  })
})
