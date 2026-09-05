import { describe, expect, it, vi } from 'vitest'

import { inferenceServiceProvidersService } from './inference-service-providers'

function createClient() {
  return {
    api: {
      v1: {
        providers: {
          '$get': vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => [{
              id: 'provider-1',
              definitionId: 'openai-compatible',
              config: { baseUrl: 'https://example.com/v1/' },
              updatedAt: '2026-01-02T00:00:00.000Z',
              deletedAt: null,
            }],
          })),
          ':id': {
            $put: vi.fn(async () => ({
              ok: true,
              status: 200,
              json: async (): Promise<unknown> => ({
                id: 'provider-1',
                definitionId: 'openai-compatible',
                config: { apiKey: 'sk-test' },
                updatedAt: '2026-01-03T00:00:00.000Z',
                deletedAt: null,
              }),
            })),
            $delete: vi.fn(async () => ({ ok: true, status: 204 })),
          },
        },
      },
    },
  }
}

describe('services inference-service-providers', () => {
  it('lists remote replica rows including timestamps', async () => {
    const client = createClient()

    await expect(inferenceServiceProvidersService.listRemote(client)).resolves.toEqual([{
      id: 'provider-1',
      definitionId: 'openai-compatible',
      config: { baseUrl: 'https://example.com/v1/' },
      updatedAt: '2026-01-02T00:00:00.000Z',
      deletedAt: null,
    }])
  })

  it('upserts a replica row', async () => {
    const client = createClient()

    await expect(inferenceServiceProvidersService.upsertRemote(client, {
      id: 'provider-1',
      definitionId: 'openai-compatible',
      config: { apiKey: 'sk-test' },
    })).resolves.toEqual({
      id: 'provider-1',
      definitionId: 'openai-compatible',
      config: { apiKey: 'sk-test' },
      updatedAt: '2026-01-03T00:00:00.000Z',
      deletedAt: null,
    })
  })

  it('throws when an upsert fails', async () => {
    const client = createClient()
    client.api.v1.providers[':id'].$put.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    await expect(inferenceServiceProvidersService.upsertRemote(client, {
      id: 'provider-1',
      definitionId: 'openai-compatible',
      config: {},
    })).rejects.toThrow('Failed to update provider config')
  })

  it('treats a missing replica as a completed delete', async () => {
    const client = createClient()
    client.api.v1.providers[':id'].$delete.mockResolvedValue({ ok: false, status: 404 })

    await expect(inferenceServiceProvidersService.deleteRemote(client, 'provider-1')).resolves.toBeUndefined()
  })
})
