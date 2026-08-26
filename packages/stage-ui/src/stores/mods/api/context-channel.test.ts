import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createContextChannel } from './context-channel'

const channels: Array<ReturnType<typeof createContextChannel>> = []

afterEach(() => {
  for (const channel of channels)
    channel.dispose(new Error('Context channel test ended'))
  channels.length = 0
})

describe('createContextChannel', () => {
  it('delivers a context update once to another Stage context', async () => {
    const sender = createContextChannel()
    const receiver = createContextChannel()
    channels.push(sender, receiver)
    const received = vi.fn()
    const localEcho = vi.fn()
    receiver.onContext(received)
    sender.onContext(localEcho)

    await sender.emitContext({
      id: 'context-1',
      contextId: 'context-1',
      strategy: ContextUpdateStrategy.AppendSelf,
      text: 'hello',
      createdAt: 1,
    })

    await vi.waitFor(() => {
      expect(received).toHaveBeenCalledTimes(1)
    })
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }))
    expect(localEcho).not.toHaveBeenCalled()
  })
})
