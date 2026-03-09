import type { PlannerCheckpoint } from '@proj-airi/memory-alaya'

import { describe, expect, it } from 'vitest'

import { createChatSessionWorkspaceMemorySource } from './workspace-memory-source'

describe('chat session workspace memory source', () => {
  it('maps chat messages and applies turn_id checkpoint incrementally', async () => {
    const source = createChatSessionWorkspaceMemorySource({
      loadSession: async () => ({
        meta: {
          sessionId: 'session-a',
          userId: 'user-a',
          characterId: 'char-a',
          createdAt: 1000,
          updatedAt: 1000,
        },
        messages: [
          { id: 'm1', role: 'system', content: 'system prompt', createdAt: 1000 },
          { id: 'm2', role: 'user', content: 'I prefer tea over coffee.', createdAt: 1001 },
          { id: 'm3', role: 'assistant', content: 'Noted.', slices: [], tool_results: [], createdAt: 1002 },
          { id: 'm4', role: 'user', content: 'Please avoid spicy food.', createdAt: 1003 },
        ],
      }),
    })

    const firstBatch = await source.listTurns({
      scope: {
        workspaceId: 'workspace-a',
        sessionId: 'session-a',
      },
      maxConversations: 1,
      maxTurns: 2,
    })

    expect(firstBatch.turns).toHaveLength(2)
    expect(firstBatch.turns[0].turnId).toBe('m2')
    expect(firstBatch.turns[1].turnId).toBe('m3')
    expect(firstBatch.nextCursor).toBe('m3')

    const checkpoint: PlannerCheckpoint = {
      workspaceId: 'workspace-a',
      cursorType: 'turn_id',
      cursor: 'm2',
      updatedAt: 1001,
    }
    const secondBatch = await source.listTurns({
      scope: {
        workspaceId: 'workspace-a',
        sessionId: 'session-a',
      },
      checkpoint,
      maxConversations: 1,
      maxTurns: 5,
    })

    expect(secondBatch.turns).toHaveLength(2)
    expect(secondBatch.turns[0].turnId).toBe('m3')
    expect(secondBatch.turns[1].turnId).toBe('m4')
    expect(secondBatch.turns[1].content).toContain('avoid spicy food')
  })
})
