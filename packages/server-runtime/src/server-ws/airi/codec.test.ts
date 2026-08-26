import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import { stringify as stringifySuperJson } from 'superjson'
import { describe, expect, it } from 'vitest'

import {
  heartbeatFrameFrom,
  InvalidEventError,
  parseEvent,
  stringifyEvent,
} from './codec'

describe('airi websocket codec', () => {
  it('parses superjson encoded events', () => {
    const event: WebSocketEvent = {
      data: { token: 'secret' },
      metadata: {
        event: { id: 'event-1' },
        source: {
          id: 'test-plugin-1',
          kind: 'plugin',
          plugin: { id: 'test-plugin' },
        },
      },
      type: 'module:authenticate',
    }

    expect(parseEvent(stringifySuperJson(event))).toEqual(event)
  })

  it('falls back to plain JSON events', () => {
    const event: WebSocketEvent = {
      data: { token: 'secret' },
      metadata: {
        event: { id: 'event-1' },
        source: {
          id: 'test-plugin-1',
          kind: 'plugin',
          plugin: { id: 'test-plugin' },
        },
      },
      type: 'module:authenticate',
    }

    expect(parseEvent(JSON.stringify(event))).toEqual(event)
  })

  it('rejects invalid event envelopes', () => {
    expect(() => parseEvent('null'))
      .toThrow(InvalidEventError)
    expect(() => parseEvent(JSON.stringify({ data: {} })))
      .toThrow(InvalidEventError)
    expect(() => parseEvent(JSON.stringify({ data: {}, type: 0 })))
      .toThrow(InvalidEventError)
    expect(() => parseEvent(JSON.stringify({ type: 'module:authenticate' })))
      .toThrow(InvalidEventError)
    expect(() => parseEvent(JSON.stringify({ data: null, type: 'module:authenticate' })))
      .toThrow(InvalidEventError)
    expect(() => parseEvent(JSON.stringify({ data: 'secret', type: 'module:authenticate' })))
      .toThrow(InvalidEventError)
    expect(() => parseEvent(JSON.stringify({ data: [], type: 'module:authenticate' })))
      .toThrow(InvalidEventError)
  })

  it('keeps validation cause and source on invalid event errors', () => {
    const source = { data: 'secret', type: 'module:authenticate' }

    try {
      parseEvent(JSON.stringify(source))
      expect.unreachable('Expected invalid event parsing to throw.')
    }
    catch (error) {
      expect(error).toBeInstanceOf(InvalidEventError)
      expect(error).toMatchObject({ source })
      expect((error as InvalidEventError).cause).toEqual(expect.arrayContaining([
        expect.objectContaining({
          message: 'Expected event data to be a non-array object.',
        }),
      ]))
    }
  })

  it('detects raw ping and pong control frames', () => {
    expect(heartbeatFrameFrom('ping')).toBe('ping')
    expect(heartbeatFrameFrom('pong')).toBe('pong')
    expect(heartbeatFrameFrom('{"type":"ping"}')).toBeUndefined()
  })

  it('preserves raw string events when stringifying', () => {
    expect(stringifyEvent('raw-payload')).toBe('raw-payload')
  })
})
