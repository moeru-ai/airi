import { describe, expect, it, vi } from 'vitest'

import { createDocumentSyncClient } from './client'

function createClient(response: Response) {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response)
  return { fetch, client: createDocumentSyncClient({ serverUrl: 'https://api.example/base/', collection: 'character-cards', fetch }) }
}

describe('createDocumentSyncClient', () => {
  it('sends the revision of a deletion as a query parameter', async () => {
    const { fetch, client } = createClient(new Response(null, { status: 204 }))

    const deleted = await client.remove('card/1', 4)

    expect(deleted).toBe(true)
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.example/base/api/v1/sync/character-cards/card%2F1?revision=4')
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
})
