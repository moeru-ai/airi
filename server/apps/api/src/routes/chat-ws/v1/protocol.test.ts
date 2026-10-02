import type { HonoWsEventContext } from '@moeru/eventa/adapters/websocket/hono'

import { defineInboundEventa, defineOutboundEventa } from '@moeru/eventa'
import { createPeerHooks } from '@moeru/eventa/adapters/websocket/hono'
import { WSContext } from 'hono/ws'
import { describe, expect, it, vi } from 'vitest'

const legacyPing = defineInboundEventa<{ value: string }>('chat-ws:legacy-ping')
const serverPong = defineOutboundEventa<{ value: string }>('chat-ws:server-pong')

function createPeer(sent: string[]): WSContext {
  return new WSContext({
    send(data) {
      sent.push(String(data))
    },
    close() {},
    readyState: 1,
  })
}

describe('v1 chat WebSocket protocol', () => {
  // https://github.com/moeru-ai/airi/pull/2308
  // ROOT CAUSE:
  //
  // Eventa beta.14 changed the adapter envelope. The chat server then added a
  // second Eventa package to parse beta.13 clients.
  //
  // Eventa beta.15 restores dual-shape transport support. This test sends an
  // actual beta.13 envelope and checks that the server also writes its legacy
  // fields. Therefore the server needs one Eventa package.
  it('reads and writes beta.13 envelopes through the beta.15 adapter', async () => {
    const received: Array<{ value: string }> = []
    const sent: string[] = []
    let context: HonoWsEventContext | undefined
    const { hooks } = createPeerHooks({
      onContext(created) {
        context = created
        created.on(legacyPing, (event) => {
          if (!event.body)
            throw new Error('Legacy Eventa envelope did not include a body')
          received.push(event.body)
        })
      },
    })
    const peer = createPeer(sent)

    hooks.onOpen?.(new Event('open'), peer)
    hooks.onMessage?.(new MessageEvent('message', {
      data: JSON.stringify({
        id: 'beta13-delivery',
        type: 'chat-ws:legacy-ping',
        payload: {
          id: 'chat-ws:legacy-ping',
          body: { value: 'from-beta13' },
        },
      }),
    }), peer)

    await vi.waitFor(() => {
      expect(received).toEqual([{ value: 'from-beta13' }])
    })

    if (!context)
      throw new Error('WebSocket context was not created')

    await context.emit(serverPong, { value: 'from-beta15' })

    expect(sent).toHaveLength(2)
    expect(JSON.parse(sent.at(-1)!)).toMatchObject({
      deliveryId: expect.any(String),
      hopsRemaining: expect.any(Number),
      eventa: { id: 'chat-ws:server-pong', body: { value: 'from-beta15' } },
      id: expect.any(String),
      type: 'chat-ws:server-pong',
      payload: { id: 'chat-ws:server-pong', body: { value: 'from-beta15' } },
    })
  })
})
