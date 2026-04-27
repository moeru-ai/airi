import { describe, expect, it, vi } from 'vitest'

import { createMemoryRawTurnUploadRuntime } from './uploader'

describe('memory raw-turn uploader runtime', () => {
  it('enters disabled no-op mode when config is missing', async () => {
    const runtime = createMemoryRawTurnUploadRuntime({
      config: {
        enabled: true,
        endpointUrl: null,
        authToken: null,
        requestTimeoutMs: 10_000,
      },
    })

    expect(runtime.getStatus()).toEqual({
      mode: 'disabled',
      reason: 'memory sync upload is missing endpoint or auth token',
    })

    await expect(runtime.client.uploadRawTurns({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      trigger: {
        idleDurationMs: 9_000,
        oldestPendingTurnAgeMs: 9_000,
        pendingCharacterCount: 10,
        pendingTurnCount: 1,
        type: 'idle-threshold',
      },
      turns: [],
    })).resolves.toBeUndefined()
  })

  it('posts uploaded raw turns through the active runtime adapter', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
    }))
    const runtime = createMemoryRawTurnUploadRuntime({
      config: {
        enabled: true,
        endpointUrl: 'https://example.com/memory/raw-turns',
        authToken: 'secret-token',
        requestTimeoutMs: 10_000,
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await runtime.client.uploadRawTurns({
      scope: {
        characterId: 'character-a',
        sessionId: 'session-a',
        userId: 'user-a',
      },
      trigger: {
        idleDurationMs: 9_000,
        oldestPendingTurnAgeMs: 9_000,
        pendingCharacterCount: 10,
        pendingTurnCount: 1,
        type: 'idle-threshold',
      },
      turns: [
        {
          createdAt: 1_000,
          rawPayload: { content: 'hello' },
          role: 'user',
          scope: {
            characterId: 'character-a',
            sessionId: 'session-a',
            userId: 'user-a',
          },
          syncStatus: 'pending',
          text: 'hello',
          turnId: 'turn-1',
          updatedAt: 1_000,
          version: 1,
        },
      ],
    })

    expect(runtime.getStatus()).toEqual({
      endpointUrl: 'https://example.com/memory/raw-turns',
      mode: 'active',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/memory/raw-turns', expect.objectContaining({
      headers: expect.objectContaining({
        'Authorization': 'Bearer secret-token',
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }))
  })
})
