import { defineEventa, defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/websocket/native'
import { authenticate, RELAY_MAX_FRAME_BYTES } from '@proj-airi/server-sdk-shared/realtime'
import { WSContext } from 'hono/ws'
import { describe, expect, it, vi } from 'vitest'

import { createRealtimeWsHandlers } from '.'
import { WS_CLOSE_UNAUTHORIZED } from '../../libs/ws-auth'
import { createRealtimeRelay } from './relay'
import { createPubSubBus } from './testing'

const ping = defineEventa<{ value: string }>('proj-airi:realtime:test:ping')

function createHandlers() {
  const relay = createRealtimeRelay({ redis: createPubSubBus().connect(), instanceId: 'a' })
  const resolveUserId = vi.fn(async (token: string) => token.startsWith('token-of-') ? token.slice('token-of-'.length) : null)
  return { relay, resolveUserId, setupPeer: createRealtimeWsHandlers({ relay, resolveUserId }) }
}

/**
 * Connects one client to the handlers through an in-memory socket pair. The client side is an Eventa context on
 * the native WebSocket adapter, as the app uses.
 */
function connect(setupPeer: ReturnType<typeof createRealtimeWsHandlers>) {
  const hooks = setupPeer()
  const closes: Array<{ code?: number, reason?: string }> = []
  const clientSocket = {
    url: 'ws://relay.test/ws/v1/realtime',
    onmessage: undefined as ((event: MessageEvent) => void) | undefined,
    send(data: string) {
      sendRaw(data)
    },
  }
  const serverSide = new WSContext({
    send(data) {
      clientSocket.onmessage?.(new MessageEvent('message', { data: String(data) }))
    },
    close(code, reason) {
      closes.push({ code, reason })
    },
    readyState: 1,
  })

  function sendRaw(data: string) {
    hooks.onMessage?.(new MessageEvent('message', { data }), serverSide)
  }

  const { context } = createContext(clientSocket as unknown as WebSocket)
  hooks.onOpen?.(new Event('open'), serverSide)

  return {
    context,
    closes,
    sendRaw,
    authenticate: (token: string) => defineInvoke(context, authenticate)({ token }),
    close: () => hooks.onClose?.(new CloseEvent('close'), serverSide),
  }
}

function collect(context: ReturnType<typeof connect>['context']) {
  const received: string[] = []
  context.on(ping, event => received.push(event.body!.value))
  return received
}

describe('realtime WebSocket relay route', () => {
  it('forwards an event to the other devices of the same user only', async () => {
    const { setupPeer } = createHandlers()
    const phone = connect(setupPeer)
    const desktop = connect(setupPeer)
    const stranger = connect(setupPeer)
    const onPhone = collect(phone.context)
    const onDesktop = collect(desktop.context)
    const onStranger = collect(stranger.context)

    await expect(phone.authenticate('token-of-user-1')).resolves.toEqual({ userId: 'user-1' })
    await desktop.authenticate('token-of-user-1')
    await stranger.authenticate('token-of-user-2')

    await phone.context.emit(ping, { value: 'hello' })

    await vi.waitFor(() => expect(onDesktop).toEqual(['hello']))
    expect(onStranger).toEqual([])
    // The local emit reaches local listeners. The relay does not send the frame back.
    expect(onPhone).toEqual(['hello'])
    expect(phone.closes).toEqual([])
  })

  it('closes a connection that sends an event before it authenticates', async () => {
    const { setupPeer, relay } = createHandlers()
    const phone = connect(setupPeer)

    await phone.context.emit(ping, { value: 'early' })

    expect(phone.closes).toEqual([{ code: WS_CLOSE_UNAUTHORIZED, reason: 'unauthorized' }])
    expect(relay.activeCount()).toBe(0)
  })

  it('does not join a connection with a token that is not valid', async () => {
    const { setupPeer, relay } = createHandlers()
    const phone = connect(setupPeer)

    await expect(phone.authenticate('wrong')).rejects.toThrow()

    expect(phone.closes).toEqual([{ code: WS_CLOSE_UNAUTHORIZED, reason: 'unauthorized' }])
    expect(relay.activeCount()).toBe(0)
  })

  it.each([
    ['an event outside the realtime namespace', JSON.stringify({ type: 'chat:send-messages-send', eventa: { id: 'chat:send-messages-send' } })],
    ['a frame that is not JSON', 'not json'],
    ['a frame over the size limit', JSON.stringify({ type: 'proj-airi:realtime:test:ping', padding: 'x'.repeat(RELAY_MAX_FRAME_BYTES) })],
  ])('closes an authenticated connection that sends %s, and forwards nothing', async (_name, frame) => {
    const { setupPeer } = createHandlers()
    const phone = connect(setupPeer)
    const desktop = connect(setupPeer)
    const desktopFrames: string[] = []
    await phone.authenticate('token-of-user-1')
    await desktop.authenticate('token-of-user-1')
    desktop.context.on(ping, event => desktopFrames.push(event.body!.value))

    phone.sendRaw(frame)

    expect(phone.closes).toEqual([{ code: 1008, reason: 'invalid frame' }])
    expect(desktopFrames).toEqual([])
  })

  it('does not forward a second authenticate frame, because it holds a token', async () => {
    const { setupPeer, resolveUserId } = createHandlers()
    const phone = connect(setupPeer)
    const desktop = connect(setupPeer)
    await phone.authenticate('token-of-user-1')
    await desktop.authenticate('token-of-user-1')
    const forwarded = vi.fn()
    desktop.context.on(authenticate.sendEvent, forwarded)

    void defineInvoke(phone.context, authenticate)({ token: 'token-of-user-1' }).catch(() => {})

    await vi.waitFor(() => expect(phone.closes).toEqual([{ code: 1008, reason: 'invalid frame' }]))
    expect(forwarded).not.toHaveBeenCalled()
    expect(resolveUserId).toHaveBeenCalledTimes(2)
  })

  it('closes a connection that forwards more frames than the limit of one window', async () => {
    const { setupPeer } = createHandlers()
    const phone = connect(setupPeer)
    await phone.authenticate('token-of-user-1')
    const frame = JSON.stringify({ type: 'proj-airi:realtime:test:ping' })

    for (let index = 0; index < 200; index += 1)
      phone.sendRaw(frame)
    expect(phone.closes).toEqual([])

    phone.sendRaw(frame)
    expect(phone.closes).toEqual([{ code: 1008, reason: 'too many frames' }])
  })

  it('leaves the relay when the socket closes', async () => {
    const { setupPeer, relay } = createHandlers()
    const phone = connect(setupPeer)
    await phone.authenticate('token-of-user-1')
    expect(relay.activeCount()).toBe(1)

    phone.close()

    expect(relay.activeCount()).toBe(0)
  })
})
