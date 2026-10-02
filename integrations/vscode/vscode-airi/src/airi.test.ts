import type { WebSocketEventOptionalSource } from '@proj-airi/server-sdk'

import type { Events } from './types'

import { createContextRegistry, loadContextTokenCounter } from '@proj-airi/core-agent'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Client } from './airi'

const send = vi.hoisted(() => vi.fn<(event: WebSocketEventOptionalSource<Events>) => void>())
const sourceReader = vi.hoisted(() => ({ read: undefined as ((sourceRef: { refType: string, targetId: string }) => string | undefined) | undefined }))

vi.mock('@proj-airi/server-sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@proj-airi/server-sdk')>()
  return {
    ...sdk,
    Client: class {
      connect = vi.fn(async () => {})
      onContextSourceRequest = vi.fn((read: (sourceRef: { refType: string, targetId: string }) => string | undefined) => {
        sourceReader.read = read
        return () => {}
      })

      send = send
      close = vi.fn()
    },
  }
})

describe('vs Code context slots', () => {
  beforeEach(() => {
    send.mockClear()
  })

  // ROOT CAUSE:
  // Editor excerpts exceeded the shared pool budget and disappeared instead of becoming origin references.
  it.each(['workspace', 'events'] as const)('admits oversized %s details as a module-owned reference', async (slot) => {
    const client = new Client()
    await client.connect()
    const details = ' hello'.repeat(400)
    if (slot === 'workspace')
      await client.replaceContext(details)
    else
      await client.appendContext(details)
    const event = send.mock.lastCall?.[0]
    if (!event || event.type !== 'context:update')
      throw new Error('Expected a context update')
    const registry = createContextRegistry({ countTokens: await loadContextTokenCounter() })
    expect(registry.ingest({ ...event.data, metadata: undefined, createdAt: Date.now() })?.mutation).toBe(slot === 'workspace' ? 'replace' : 'append')
    expect(event.data.text).not.toBe(details)
    if (!event.data.sourceRef)
      throw new Error('Expected an origin reference')
    expect(client.getContext(event.data.sourceRef)).toBe(details)
    expect(sourceReader.read?.(event.data.sourceRef)).toBe(details)
    client.disconnect()
    expect(client.getContext(event.data.sourceRef)).toBeUndefined()
  })

  it('bounds retained event details and replaces the current workspace source', async () => {
    const client = new Client()
    await client.connect()
    await client.replaceContext('first workspace')
    await client.replaceContext('current workspace')
    expect(client.getContext({ refType: 'vscode:context', targetId: 'workspace' })).toBe('current workspace')
    expect(client.getContext({ refType: 'other-module', targetId: 'workspace' })).toBeUndefined()
    for (let index = 0; index < 9; index++)
      await client.appendContext(`event ${index}`)
    const firstEvent = send.mock.calls[2]?.[0]
    const lastEvent = send.mock.lastCall?.[0]
    if (!firstEvent || firstEvent.type !== 'context:update' || !firstEvent.data.sourceRef
      || !lastEvent || lastEvent.type !== 'context:update' || !lastEvent.data.sourceRef) {
      throw new Error('Expected retained event references')
    }
    expect(client.getContext(firstEvent.data.sourceRef)).toBeUndefined()
    expect(client.getContext(lastEvent.data.sourceRef)).toBe('event 8')
    client.disconnect()
  })

  // ROOT CAUSE:
  // Random contextId values accumulated obsolete documents instead of replacing the current workspace observation.
  // Updates now use workspace, while append operations use the bounded events slot.
  it('replaces one workspace slot across repeated updates', async () => {
    const client = new Client()
    await client.connect()

    await client.replaceContext('first document')
    await client.replaceContext('second document')

    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ contextId: 'workspace', strategy: 'replace-self', text: 'first document' }),
    }))
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ contextId: 'workspace', strategy: 'replace-self', text: 'second document' }),
    }))

    client.disconnect()
  })

  it('appends observations to a fixed event slot', async () => {
    const client = new Client()
    await client.connect()

    await client.appendContext('first event')
    await client.appendContext('second event')

    expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ contextId: 'events', strategy: 'append-self', text: 'first event' }),
    }))
    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ contextId: 'events', strategy: 'append-self', text: 'second event' }),
    }))

    client.disconnect()
  })
})
