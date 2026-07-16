import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import { stringify as stringifySuperJson } from 'superjson'
import { describe, expect, it } from 'vitest'

import { InvalidMessageError, parseEvent, stringifyEvent } from '../src/codec'

describe('server-sdk codec', () => {
  it('parses SuperJSON and plain JSON protocol events', () => {
    const event: WebSocketEvent = {
      type: 'module:authenticate',
      data: { token: 'secret' },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'plugin-1' }, id: 'plugin-1' },
        event: { id: 'event-1' },
      },
    }

    expect(parseEvent(stringifySuperJson(event))).toEqual(event)
    expect(parseEvent(JSON.stringify(event))).toEqual(event)
  })

  it('throws debuggable errors for invalid messages', () => {
    const source = { type: 'module:authenticate', data: 'secret' }

    try {
      parseEvent(JSON.stringify(source))
      expect.unreachable('Expected invalid message parsing to throw.')
    }
    catch (error) {
      expect(error).toBeInstanceOf(InvalidMessageError)
      expect(error).toMatchObject({ source })
      expect((error as InvalidMessageError).cause).toEqual(expect.anything())
    }
  })

  it('rejects array event data with validation context', () => {
    const source = { type: 'module:authenticate', data: ['secret'] }

    expect(() => parseEvent(JSON.stringify(source))).toThrow(InvalidMessageError)

    try {
      parseEvent(JSON.stringify(source))
    }
    catch (error) {
      expect(error).toMatchObject({ source })
      expect((error as InvalidMessageError).cause).toEqual(expect.anything())
    }
  })

  it('wraps malformed event text with the original source', () => {
    const source = '{not-json'

    try {
      parseEvent(source)
      expect.unreachable('Expected malformed message parsing to throw.')
    }
    catch (error) {
      expect(error).toBeInstanceOf(InvalidMessageError)
      expect(error).toMatchObject({ source })
      expect((error as InvalidMessageError).cause).toBeInstanceOf(Error)
    }
  })

  it('stringifies protocol events with SuperJSON', () => {
    expect(stringifyEvent({
      type: 'module:authenticate',
      data: { token: 'secret' },
    })).toContain('module:authenticate')
  })
})
