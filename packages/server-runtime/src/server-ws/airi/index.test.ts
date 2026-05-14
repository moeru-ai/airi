import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import { stringify } from 'superjson'
import { describe, expect, it } from 'vitest'

import {
  AiriWebSocketEventFormatError,
  heartbeatFrameFrom,
  parseEvent,
} from '.'

describe('airi websocket protocol codec', () => {
  it('parses superjson encoded events', () => {
    const event: WebSocketEvent = {
      type: 'module:authenticate',
      data: { token: 'secret' },
      metadata: {
        source: {
          kind: 'plugin',
          id: 'test-plugin-1',
          plugin: { id: 'test-plugin' },
        },
        event: { id: 'event-1' },
      },
    }

    expect(parseEvent(stringify(event))).toEqual(event)
  })

  it('falls back to plain JSON events', () => {
    const event: WebSocketEvent = {
      type: 'module:authenticate',
      data: { token: 'secret' },
      metadata: {
        source: {
          kind: 'plugin',
          id: 'test-plugin-1',
          plugin: { id: 'test-plugin' },
        },
        event: { id: 'event-1' },
      },
    }

    expect(parseEvent(JSON.stringify(event))).toEqual(event)
  })

  it('rejects payloads without event type', () => {
    expect(() => parseEvent('null'))
      .toThrow(AiriWebSocketEventFormatError)
    expect(() => parseEvent(JSON.stringify({ data: {} })))
      .toThrow(AiriWebSocketEventFormatError)
  })

  it('rejects payloads with non-string event type', () => {
    expect(() => parseEvent(JSON.stringify({ type: 0, data: {} })))
      .toThrow(AiriWebSocketEventFormatError)
  })

  it('rejects payloads without object event data', () => {
    expect(() => parseEvent(JSON.stringify({ type: 'module:authenticate' })))
      .toThrow(AiriWebSocketEventFormatError)
    expect(() => parseEvent(JSON.stringify({ type: 'module:authenticate', data: null })))
      .toThrow(AiriWebSocketEventFormatError)
    expect(() => parseEvent(JSON.stringify({ type: 'module:authenticate', data: 'secret' })))
      .toThrow(AiriWebSocketEventFormatError)
  })

  it('rejects payloads with array event data', () => {
    expect(() => parseEvent(JSON.stringify({ type: 'module:authenticate', data: [] })))
      .toThrow(AiriWebSocketEventFormatError)
  })

  it('classifies raw ping and pong control frames', () => {
    expect(heartbeatFrameFrom('ping')).toBe('ping')
    expect(heartbeatFrameFrom('pong')).toBe('pong')
    expect(heartbeatFrameFrom('{"type":"ping"}')).toBeUndefined()
  })
})
