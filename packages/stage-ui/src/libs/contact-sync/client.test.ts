import { describe, expect, it, vi } from 'vitest'

import { ContactSyncError, createContactClient } from './client'

describe('contact HTTP boundary', () => {
  it('uses the scoped transport and requires explicit direct-history deletion consent', async () => {
    const contact = {
      id: 'remote-contact',
      ownerId: 'owner',
      characterId: 'remote-character',
      localCharacterId: 'local/role',
      lastMutationId: null,
      revision: 2,
      createdAt: '2026-09-28T00:00:00.000Z',
      updatedAt: '2026-09-28T00:00:00.000Z',
      deletedAt: '2026-09-28T00:00:00.000Z',
    }
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ contact, chatIds: ['history'] })))
    const client = createContactClient({ serverUrl: 'https://example.test/', fetch: transport })
    expect(await client.delete('local/role')).toEqual({ contact, chatIds: ['history'] })
    const [url, request] = transport.mock.calls[0]
    expect(String(url)).toBe('https://example.test/api/v1/contacts/characters/local%2Frole/delete')
    expect(request?.method).toBe('POST')
    expect(request?.body).toBe(JSON.stringify({ deleteDirectConversations: true }))
    expect(request?.signal).toBeInstanceOf(AbortSignal)
  })

  it('rejects malformed success payloads and retains HTTP conflict status', async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ contacts: [{ id: 'partial' }] })))
      .mockResolvedValueOnce(new Response('{}', { status: 409 }))
    const client = createContactClient({ serverUrl: 'https://example.test', fetch: transport })
    await expect(client.list()).rejects.toThrow()
    await expect(client.delete('local')).rejects.toEqual(new ContactSyncError(409))
  })
})
