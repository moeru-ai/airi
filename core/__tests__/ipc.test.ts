/**
 * AIRI IPC — Tests
 *
 * Tests for the IPC protocol, transport interfaces, local socket transport,
 * session management, and event streaming across the IPC boundary.
 */

import { describe, it, expect, beforeEach } from 'vitest'

const _logger = (..._a: unknown[]) => void 0

import { serializeMessage, deserializeMessage } from '../ipc/protocol.js'
import type {
  IpcMessage,
  IpcEventMessage,
  IpcRequestMessage,
  IpcResponseMessage,
  IpcErrorMessage,
  IpcPingMessage,
} from '../ipc/protocol.js'
import { generateId, request } from '../ipc/transport.js'
import type { IpcClientTransport, IpcConnectionState } from '../ipc/transport.js'
import { SessionManager } from '../runtime/session.js'

// ── Protocol tests ────────────────────────────────────────────────────

describe('ipc/protocol', () => {
  describe('serializeMessage / deserializeMessage', () => {
    it('round-trips an event message', () => {
      const msg: IpcEventMessage = {
        id: 'test-1',
        type: 'event',
        timestamp: '2025-01-15T10:00:00.000Z',
        payload: { type: 'task.started', taskId: 't1' },
      }

      const serialized = serializeMessage(msg)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized).not.toBeNull()
      expect(deserialized!.id).toBe('test-1')
      expect(deserialized!.type).toBe('event')
      expect((deserialized as IpcEventMessage).payload).toEqual({
        type: 'task.started',
        taskId: 't1',
      })
    })

    it('round-trips a request message', () => {
      const msg: IpcRequestMessage = {
        id: 'req-1',
        type: 'request',
        timestamp: '2025-01-15T10:00:00.000Z',
        correlationId: 'req-1',
        method: 'module.list',
        params: {},
      }

      const serialized = serializeMessage(msg)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized).not.toBeNull()
      expect((deserialized as IpcRequestMessage).method).toBe('module.list')
      expect((deserialized as IpcRequestMessage).correlationId).toBe('req-1')
    })

    it('round-trips a response message', () => {
      const msg: IpcResponseMessage = {
        id: 'resp-1',
        type: 'response',
        timestamp: '2025-01-15T10:00:00.000Z',
        correlationId: 'req-1',
        result: { modules: [] },
      }

      const serialized = serializeMessage(msg)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized).not.toBeNull()
      expect((deserialized as IpcResponseMessage).result).toEqual({ modules: [] })
    })

    it('round-trips an error message', () => {
      const msg: IpcErrorMessage = {
        id: 'err-1',
        type: 'error',
        timestamp: '2025-01-15T10:00:00.000Z',
        correlationId: 'req-1',
        code: 'NOT_FOUND',
        message: 'Module not found',
      }

      const serialized = serializeMessage(msg)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized).not.toBeNull()
      expect((deserialized as IpcErrorMessage).code).toBe('NOT_FOUND')
    })

    it('round-trips ping/pong messages', () => {
      const ping: IpcPingMessage = {
        id: 'ping-1',
        type: 'ping',
        timestamp: '2025-01-15T10:00:00.000Z',
      }

      const serialized = serializeMessage(ping)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized).not.toBeNull()
      expect(deserialized!.type).toBe('ping')
    })

    it('returns null for invalid JSON', () => {
      expect(deserializeMessage('not json')).toBeNull()
    })

    it('returns null for missing required fields', () => {
      expect(deserializeMessage('{"id":"1"}')).toBeNull()
      expect(deserializeMessage('{"id":"1","type":"event"}')).toBeNull()
    })

    it('returns null for unknown message type', () => {
      expect(deserializeMessage('{"id":"1","type":"unknown","timestamp":"2025-01-15T10:00:00.000Z"}')).toBeNull()
    })
  })

  describe('message structure', () => {
    it('produces plain objects (serialization-safe)', () => {
      const msg: IpcEventMessage = {
        id: 'test-1',
        type: 'event',
        timestamp: '2025-01-15T10:00:00.000Z',
        payload: { data: [1, 2, 3] },
      }

      const serialized = serializeMessage(msg)
      const parsed = JSON.parse(serialized)

      expect(typeof parsed).toBe('object')
      expect(parsed.id).toBe('test-1')
      expect(parsed.payload.data).toEqual([1, 2, 3])
    })
  })
})

// ── Transport tests ───────────────────────────────────────────────────

describe('ipc/transport', () => {
  describe('generateId', () => {
    it('generates unique IDs', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateId())
      }
      expect(ids.size).toBe(100)
    })

    it('generates non-empty strings', () => {
      const id = generateId()
      expect(id.length).toBeGreaterThan(0)
    })
  })

  describe('request helper', () => {
    it('sends a request and resolves with the response', async () => {
      const sentMessages: IpcMessage[] = []
      const mockTransport = createMockTransport('connected', sentMessages)

      // Simulate a response after a tick.
      setTimeout(() => {
        const req = sentMessages[0] as IpcRequestMessage
        mockTransport.simulateMessage({
          id: generateId(),
          type: 'response',
          timestamp: new Date().toISOString(),
          correlationId: req.id,
          result: { success: true },
        })
      }, 0)

      const result = await request(mockTransport, 'test.method', { foo: 'bar' })

      expect(result).toEqual({ success: true })

      // Verify the request was sent correctly.
      expect(sentMessages).toHaveLength(1)
      const req = sentMessages[0] as IpcRequestMessage
      expect(req.type).toBe('request')
      expect(req.method).toBe('test.method')
      expect(req.params).toEqual({ foo: 'bar' })
      expect(req.correlationId).toBe(req.id)
    })

    it('rejects on error response', async () => {
      const sentMessages: IpcMessage[] = []
      const mockTransport = createMockTransport('connected', sentMessages)

      setTimeout(() => {
        const req = sentMessages[0] as IpcRequestMessage
        mockTransport.simulateMessage({
          id: generateId(),
          type: 'error',
          timestamp: new Date().toISOString(),
          correlationId: req.id,
          code: 'NOT_FOUND',
          message: 'Module not found',
        })
      }, 0)

      await expect(request(mockTransport, 'module.get', { id: 'missing' })).rejects.toThrow(
        'NOT_FOUND: Module not found',
      )
    })

    it('rejects when transport is not connected', async () => {
      const mockTransport = createMockTransport('disconnected')

      await expect(request(mockTransport, 'test.method')).rejects.toThrow(
        'Cannot send request: transport is disconnected',
      )
    })

    it('times out if no response is received', async () => {
      const sentMessages: IpcMessage[] = []
      const mockTransport = createMockTransport('connected', sentMessages)

      await expect(request(mockTransport, 'slow.method', {}, { timeout: 50 })).rejects.toThrow('timed out after 50ms')
    })
  })
})

// ── Session management tests ──────────────────────────────────────────

describe('runtime/session', () => {
  let sessions: SessionManager

  beforeEach(() => {
    sessions = new SessionManager()
  })

  describe('attach / detach', () => {
    it('creates a session in attaching state', () => {
      const session = sessions.attach('client-1')

      expect(session.clientId).toBe('client-1')
      expect(session.state).toBe('attaching')
      expect(session.isConnected).toBe(true)
      expect(session.sessionId).toMatch(/^sess_/)
    })

    it('transitions to attached state', () => {
      const session = sessions.attach('client-1')
      const attached = sessions.markAttached(session.sessionId)

      expect(attached).toBeDefined()
      expect(attached!.state).toBe('attached')
    })

    it('transitions to detached state', () => {
      const session = sessions.attach('client-1')
      sessions.markAttached(session.sessionId)
      const detached = sessions.detach(session.sessionId)

      expect(detached).toBeDefined()
      expect(detached!.state).toBe('detached')
      expect(detached!.isConnected).toBe(false)
    })

    it('returns undefined for unknown session', () => {
      expect(sessions.markAttached('nonexistent')).toBeUndefined()
      expect(sessions.detach('nonexistent')).toBeUndefined()
    })
  })

  describe('query', () => {
    it('gets session by ID', () => {
      const session = sessions.attach('client-1')
      const found = sessions.get(session.sessionId)

      expect(found).toBeDefined()
      expect(found!.sessionId).toBe(session.sessionId)
    })

    it('gets session by client ID', () => {
      const session = sessions.attach('client-1')
      sessions.markAttached(session.sessionId)
      const found = sessions.getByClientId('client-1')

      expect(found).toBeDefined()
      expect(found!.sessionId).toBe(session.sessionId)
    })

    it('returns all sessions', () => {
      sessions.attach('client-1')
      sessions.attach('client-2')

      expect(sessions.count()).toBe(2)
      expect(sessions.all()).toHaveLength(2)
    })

    it('filters by state', () => {
      const s1 = sessions.attach('client-1')
      sessions.markAttached(s1.sessionId)
      sessions.attach('client-2') // still attaching

      expect(sessions.all('attached')).toHaveLength(1)
      expect(sessions.all('attaching')).toHaveLength(1)
    })

    it('returns only connected sessions', () => {
      const s1 = sessions.attach('client-1')
      sessions.markAttached(s1.sessionId)
      const s2 = sessions.attach('client-2')
      sessions.markAttached(s2.sessionId)
      sessions.detach(s2.sessionId)

      expect(sessions.connected()).toHaveLength(1)
    })
  })

  describe('cleanupDetached', () => {
    it('removes detached sessions', () => {
      const s1 = sessions.attach('client-1')
      sessions.markAttached(s1.sessionId)
      sessions.detach(s1.sessionId)

      const removed = sessions.cleanupDetached()

      expect(removed).toBe(1)
      expect(sessions.count()).toBe(0)
    })

    it('does not remove attached sessions', () => {
      const s1 = sessions.attach('client-1')
      sessions.markAttached(s1.sessionId)

      const removed = sessions.cleanupDetached()

      expect(removed).toBe(0)
      expect(sessions.count()).toBe(1)
    })
  })
})

// ── Event streaming across IPC boundary ───────────────────────────────

describe('event streaming', () => {
  it('serializes AiriEvent for IPC transport', () => {
    const event = {
      type: 'task.started',
      timestamp: '2025-01-15T10:00:00.000Z',
      source: 'code',
      taskId: 'task-1',
      label: 'Test task',
    }

    const ipcMessage: IpcEventMessage = {
      id: generateId(),
      type: 'event',
      timestamp: event.timestamp,
      payload: event as unknown as Record<string, unknown>,
    }

    const serialized = serializeMessage(ipcMessage)
    const deserialized = deserializeMessage(serialized)

    expect(deserialized).not.toBeNull()
    expect((deserialized as IpcEventMessage).payload).toEqual(event)
  })

  it('handles multiple event types', () => {
    const events = [
      {
        type: 'task.started',
        timestamp: '2025-01-15T10:00:00.000Z',
        source: 'code',
        taskId: 't1',
      },
      {
        type: 'task.completed',
        timestamp: '2025-01-15T10:00:01.000Z',
        source: 'code',
        taskId: 't1',
        summary: 'Done',
      },
      {
        type: 'module.activated',
        timestamp: '2025-01-15T10:00:00.000Z',
        source: 'core',
        moduleId: 'code',
        moduleName: 'Code Module',
      },
      {
        type: 'tool.called',
        timestamp: '2025-01-15T10:00:00.500Z',
        source: 'code',
        callId: 'c1',
        toolName: 'read_file',
      },
    ]

    for (const event of events) {
      const msg: IpcEventMessage = {
        id: generateId(),
        type: 'event',
        timestamp: event.timestamp,
        payload: event as unknown as Record<string, unknown>,
      }

      const serialized = serializeMessage(msg)
      const deserialized = deserializeMessage(serialized)

      expect(deserialized).not.toBeNull()
      expect((deserialized as IpcEventMessage).payload.type).toBe(event.type)
    }
  })
})

// ── Mock transport factory ────────────────────────────────────────────

/**
 * Creates a mock IpcClientTransport for testing.
 */
function createMockTransport(
  initialState: IpcConnectionState,
  sentMessages: IpcMessage[] = [],
): IpcClientTransport & { simulateMessage: (msg: IpcMessage) => void } {
  let state = initialState
  const messageHandlers = new Set<(msg: IpcMessage) => void>()
  const stateHandlers = new Set<(state: IpcConnectionState) => void>()
  const disconnectHandlers = new Set<() => void>()

  return {
    get state() {
      return state
    },

    connect(): Promise<void> {
      state = 'connected'
      for (const handler of stateHandlers) handler(state)
      return Promise.resolve()
    },

    disconnect(): Promise<void> {
      state = 'disconnected'
      for (const handler of disconnectHandlers) handler()
      for (const handler of stateHandlers) handler(state)
      return Promise.resolve()
    },

    send(message: IpcMessage): Promise<void> {
      if (state !== 'connected') {
        throw new Error(`Cannot send: transport is ${state}.`)
      }
      sentMessages.push(message)
      return Promise.resolve()
    },

    onMessage(handler: (msg: IpcMessage) => void): () => void {
      messageHandlers.add(handler)
      return () => {
        messageHandlers.delete(handler)
      }
    },

    onDisconnect(handler: () => void): () => void {
      disconnectHandlers.add(handler)
      return () => {
        disconnectHandlers.delete(handler)
      }
    },

    onStateChange(handler: (state: IpcConnectionState) => void): () => void {
      stateHandlers.add(handler)
      return () => {
        stateHandlers.delete(handler)
      }
    },

    simulateMessage(msg: IpcMessage): void {
      for (const handler of messageHandlers) {
        handler(msg)
      }
    },
  }
}
