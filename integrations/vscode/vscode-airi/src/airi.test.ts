import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Client } from './airi'

const send = vi.hoisted(() => vi.fn())

vi.mock('@proj-airi/server-sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@proj-airi/server-sdk')>()
  return {
    ...sdk,
    Client: class {
      connect = vi.fn(async () => {})
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
