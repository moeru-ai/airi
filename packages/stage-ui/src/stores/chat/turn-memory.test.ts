import { describe, expect, it, vi } from 'vitest'

import { createMemoryGateway } from '../../services/memory/gateway'
import { appendMemoryTurnSafely } from './turn-memory'

describe('appendMemoryTurnSafely', () => {
  it('does not throw when using the web stub gateway', async () => {
    const gateway = createMemoryGateway({ runtime: 'web' })

    await expect(appendMemoryTurnSafely({
      gateway,
      payload: {
        createdAt: 1000,
        rawPayload: { content: 'hello' },
        role: 'user',
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        text: 'hello',
        turnId: 'turn-1',
      },
    })).resolves.toBeUndefined()
  })

  it('logs a clear error and continues when appendTurn fails', async () => {
    const gateway = {
      appendTurn: vi.fn(async () => {
        throw new Error('append failed')
      }),
      getSyncState: vi.fn(),
      readPromptContext: vi.fn(),
    }
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(appendMemoryTurnSafely({
      gateway: gateway as any,
      payload: {
        createdAt: 1000,
        rawPayload: { content: 'hello' },
        role: 'assistant',
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        text: 'hello back',
        turnId: 'turn-2',
      },
    })).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[memory-turn-write] Failed to append turn to local memory:',
      expect.objectContaining({
        error: expect.any(Error),
        payload: expect.objectContaining({
          role: 'assistant',
          text: 'hello back',
          turnId: 'turn-2',
        }),
      }),
    )

    consoleErrorSpy.mockRestore()
  })
})
