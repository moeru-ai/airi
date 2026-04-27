import { describe, expect, it, vi } from 'vitest'

import { createMemoryPatchPullRuntime } from './patch-client'

describe('memory patch pull runtime', () => {
  it('enters disabled no-op mode when patch config is missing', async () => {
    const runtime = createMemoryPatchPullRuntime({
      config: {
        enabled: true,
        endpointUrl: null,
        authToken: null,
        pullIntervalMs: 15_000,
        requestTimeoutMs: 10_000,
        retryDelayMs: 30_000,
      },
    })

    expect(runtime.getStatus()).toEqual({
      mode: 'disabled',
      reason: 'memory patch pull is missing endpoint or auth token',
    })

    await expect(runtime.client.fetchMemoryPatch({
      characterId: 'character-a',
      sessionId: 'session-a',
      userId: 'user-a',
    }, null)).resolves.toBeNull()
  })

  it('fetches one memory patch through the active runtime adapter', async () => {
    const fetchImpl = vi.fn(async () => ({
      json: async () => ({
        scope: {
          characterId: 'character-a',
          sessionId: 'session-a',
          userId: 'user-a',
        },
        summaryPatch: {
          generatedFromTurnId: 'turn-2',
          summaryMarkdown: 'Cloud summary',
          summaryVersion: 2,
        },
      }),
      ok: true,
      status: 200,
    }))

    const runtime = createMemoryPatchPullRuntime({
      config: {
        authToken: 'token',
        enabled: true,
        endpointUrl: 'https://example.com/memory/patch',
        pullIntervalMs: 15_000,
        requestTimeoutMs: 10_000,
        retryDelayMs: 30_000,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    const result = await runtime.client.fetchMemoryPatch({
      characterId: 'character-a',
      sessionId: 'session-a',
      userId: 'user-a',
    }, null)

    expect(runtime.getStatus()).toEqual({
      endpointUrl: 'https://example.com/memory/patch',
      mode: 'active',
    })
    expect(result).toEqual({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      summaryPatch: {
        generatedFromTurnId: 'turn-2',
        summaryMarkdown: 'Cloud summary',
        summaryVersion: 2,
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/memory/patch', expect.objectContaining({
      headers: expect.objectContaining({
        'Authorization': 'Bearer token',
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }))
  })
})
