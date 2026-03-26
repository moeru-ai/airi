import type { WSContext } from 'hono/ws'

import { defineEventa, defineInvokeEventa, defineInvokeHandler } from '@moeru/eventa'
import { describe, expect, it, vi } from 'vitest'

import { createPeerHooks } from '../eventa-hono-adapter'

function createMockWSContext(): WSContext & { sentMessages: string[] } {
  const sentMessages: string[] = []
  return {
    send: vi.fn((data: string) => sentMessages.push(data)),
    close: vi.fn(),
    readyState: 1,
    raw: {},
    url: null,
    protocol: null,
    sentMessages,
  } as any
}

type HonoWsMessageEvent = Parameters<NonNullable<import('hono/ws').WSEvents['onMessage']>>[0]

describe('eventa Hono adapter', () => {
  it('creates peer context on open and cleans up on close', () => {
    let contextReceived = false
    const { hooks } = createPeerHooks({
      onContext: () => { contextReceived = true },
    })
    const ws = createMockWSContext()
    hooks.onOpen!({} as any, ws)
    expect(contextReceived).toBe(true)
    hooks.onClose!({} as any, ws)
  })

  it('routes inbound messages to eventa context and invokes handler', async () => {
    const echo = defineInvokeEventa<{ out: string }, { in: string }>('test:echo')

    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        defineInvokeHandler(ctx, echo, (req) => {
          return { out: req.in.toUpperCase() }
        })
      },
    })

    const ws = createMockWSContext()
    hooks.onOpen!({} as any, ws)

    // The invoke wire format: type must match sendEvent id, payload.body
    // carries the invoke envelope with invokeId + content.
    const invokeId = 'invoke-1'
    const payload = JSON.stringify({
      id: 'msg-1',
      type: echo.sendEvent.id,
      payload: {
        body: {
          invokeId,
          content: { in: 'hello' },
        },
      },
      timestamp: Date.now(),
    })

    const messageEvent = { data: payload } as HonoWsMessageEvent
    hooks.onMessage!(messageEvent, ws)

    await new Promise(r => setTimeout(r, 100))

    // Filter out lifecycle event messages (wsConnectedEvent)
    const responses = ws.sentMessages
      .map(m => JSON.parse(m))
      .filter((m: any) => !m.type.startsWith('eventa:adapters:'))

    expect(responses.length).toBeGreaterThan(0)

    // The invoke response payload contains the full event object spread into it.
    // The actual response content is nested under body.content.
    const response = responses[0]
    expect(response.payload.body.invokeId).toBe(invokeId)
    expect(response.payload.body.content).toEqual({ out: 'HELLO' })
  })

  it('emits simple events and forwards them over the wire', () => {
    const ping = defineEventa<{ msg: string }>('test:ping')

    let capturedCtx: any
    const { hooks } = createPeerHooks({
      onContext: (ctx) => { capturedCtx = ctx },
    })

    const ws = createMockWSContext()
    hooks.onOpen!({} as any, ws)

    // Clear the connected lifecycle message
    ws.sentMessages.length = 0

    // Emit an outbound event from the context
    capturedCtx.emit(ping, { msg: 'pong' })

    expect(ws.sentMessages.length).toBe(1)
    const sent = JSON.parse(ws.sentMessages[0])
    expect(sent.type).toBe('test:ping')
  })
})
