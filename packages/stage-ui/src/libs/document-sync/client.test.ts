import { describe, expect, it, vi } from 'vitest'

import { createDocumentSyncClient } from './client'

function createClient(response: Response) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response)
  return { fetch, client: createDocumentSyncClient({ serverUrl: 'https://api.example/base/', path: '/api/v1/character-cards', fetch }) }
}

describe('createDocumentSyncClient', () => {
  it('sends the revision of a deletion as a query parameter', async () => {
    const { fetch, client } = createClient(new Response(null, { status: 204 }))

    const deleted = await client.remove('card/1', 4)

    expect(deleted).toBe(true)
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.example/base/api/v1/character-cards/card%2F1?revision=4')
    expect(fetch.mock.calls[0][1]?.method).toBe('DELETE')
  })

  it('reports a rejected deletion without an error', async () => {
    const rejected = await createClient(new Response(null, { status: 409 })).client.remove('card', 1)

    expect(rejected).toBe(false)
  })

  it('throws on an unexpected status and on an invalid response', async () => {
    await expect(createClient(new Response(null, { status: 500 })).client.list()).rejects.toThrow('HTTP 500')
    await expect(createClient(Response.json({ documents: 'invalid' })).client.list()).rejects.toThrow()
  })

  it('lists history with before and limit as query parameters', async () => {
    const { fetch, client } = createClient(Response.json({
      history: [{ revision: 2, at: '2026-01-01T00:00:00.000Z', changed: ['/name'], removed: [] }],
    }))

    const history = await client.history('card', { before: 3, limit: 10 })

    expect(history).toEqual([{ revision: 2, at: '2026-01-01T00:00:00.000Z', changed: ['/name'], removed: [] }])
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.example/base/api/v1/character-cards/card/history?before=3&limit=10')
  })

  it('returns null when history reports a card that does not exist', async () => {
    const history = await createClient(new Response(null, { status: 404 })).client.history('missing')

    expect(history).toBeNull()
  })

  it('reads a snapshot of a past revision', async () => {
    const { fetch, client } = createClient(Response.json({
      revision: 1,
      at: '2026-01-01T00:00:00.000Z',
      fields: [{ key: '/name', value: 'Luna' }],
    }))

    const snapshot = await client.snapshot('card', 1)

    expect(snapshot).toEqual({ revision: 1, at: '2026-01-01T00:00:00.000Z', fields: [{ key: '/name', value: 'Luna' }] })
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.example/base/api/v1/character-cards/card/history/1')
  })

  it('returns null when a snapshot revision does not exist', async () => {
    const snapshot = await createClient(new Response(null, { status: 404 })).client.snapshot('card', 99)

    expect(snapshot).toBeNull()
  })
})
