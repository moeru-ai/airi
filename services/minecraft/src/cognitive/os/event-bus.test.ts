import type { TracedEvent } from './types'

import { useLogg } from '@guiiai/logg'
import { describe, expect, it, vi } from 'vitest'

import { createEventBus } from './index'

describe('eventBus', () => {
  const createTestBus = () =>
    createEventBus({
      logger: useLogg('test'),
      config: { historySize: 100 },
    })

  describe('emit', () => {
    it('should create an event with auto-generated id and timestamp', () => {
      const bus = createTestBus()

      const event = bus.emit({
        type: 'test:event',
        payload: { foo: 'bar' },
        traceId: 'trace-1',
        source: { component: 'test' },
      })

      expect(event.id).toBeDefined()
      expect(event.id.length).toBe(12)
      expect(event.traceId).toBe('trace-1')
      expect(event.type).toBe('test:event')
      expect(event.payload).toEqual({ foo: 'bar' })
      expect(event.timestamp).toBeGreaterThan(0)
    })

    it('should generate traceId if not provided', () => {
      const bus = createTestBus()

      const event = bus.emit({
        type: 'test:event',
        payload: {},
        source: { component: 'test' },
      })

      expect(event.traceId).toBeDefined()
      expect(event.traceId.length).toBe(16)
    })

    it('should freeze the event (immutable)', () => {
      const bus = createTestBus()

      const event = bus.emit({
        type: 'test:event',
        payload: { mutable: 'data' },
        source: { component: 'test' },
      })

      expect(Object.isFrozen(event)).toBe(true)
      expect(Object.isFrozen(event.payload)).toBe(true)
      expect(Object.isFrozen(event.source)).toBe(true)
    })

    it('should deep freeze nested objects in payload', () => {
      const bus = createTestBus()

      const event = bus.emit({
        type: 'test:event',
        payload: {
          level1: {
            level2: {
              value: 42,
            },
          },
          array: [{ item: 1 }, { item: 2 }],
        },
        source: { component: 'test' },
      })

      expect(Object.isFrozen(event.payload)).toBe(true)
      expect(Object.isFrozen((event.payload as any).level1)).toBe(true)
      expect(Object.isFrozen((event.payload as any).level1.level2)).toBe(true)
      expect(Object.isFrozen((event.payload as any).array)).toBe(true)
      expect(Object.isFrozen((event.payload as any).array[0])).toBe(true)
    })
  })

  describe('emitChild', () => {
    it('should inherit traceId and set parentId', () => {
      const bus = createTestBus()

      const parent = bus.emit({
        type: 'parent:event',
        payload: {},
        source: { component: 'test' },
      })

      const child = bus.emitChild(parent, {
        type: 'child:event',
        payload: { derived: true },
        source: { component: 'test' },
      })

      expect(child.traceId).toBe(parent.traceId)
      expect(child.parentId).toBe(parent.id)
    })
  })

  describe('subscribe', () => {
    it('should call handler for matching events', () => {
      const bus = createTestBus()
      const handler = vi.fn()

      bus.subscribe('test:event', handler)
      bus.emit({
        type: 'test:event',
        payload: { data: 123 },
        source: { component: 'test' },
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].payload).toEqual({ data: 123 })
    })

    it('should support wildcard patterns', () => {
      const bus = createTestBus()
      const handler = vi.fn()

      bus.subscribe('raw:*', handler)

      bus.emit({
        type: 'raw:sighted:punch',
        payload: {},
        source: { component: 'test' },
      })
      bus.emit({
        type: 'raw:heard:sound',
        payload: {},
        source: { component: 'test' },
      })
      bus.emit({
        type: 'signal:attention',
        payload: {},
        source: { component: 'test' },
      })

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('should return unsubscribe function', () => {
      const bus = createTestBus()
      const handler = vi.fn()

      const unsub = bus.subscribe('test:*', handler)

      bus.emit({
        type: 'test:one',
        payload: {},
        source: { component: 'test' },
      })
      expect(handler).toHaveBeenCalledTimes(1)

      unsub()

      bus.emit({
        type: 'test:two',
        payload: {},
        source: { component: 'test' },
      })
      expect(handler).toHaveBeenCalledTimes(1) // Still 1
    })
  })

  describe('trace context propagation', () => {
    it('should propagate trace context in handlers', () => {
      const bus = createTestBus()
      let childEvent: TracedEvent | undefined

      bus.subscribe('parent:event', () => {
        // Emit within handler - should inherit context
        childEvent = bus.emit({
          type: 'child:event',
          payload: {},
          source: { component: 'handler' },
        })
      })

      const parent = bus.emit({
        type: 'parent:event',
        payload: {},
        source: { component: 'test' },
      })

      expect(childEvent).toBeDefined()
      expect(childEvent!.traceId).toBe(parent.traceId)
      expect(childEvent!.parentId).toBe(parent.id)
    })
  })

  describe('history', () => {
    it('should store events in history', () => {
      const bus = createTestBus()

      bus.emit({ type: 'e1', payload: {}, source: { component: 'test' } })
      bus.emit({ type: 'e2', payload: {}, source: { component: 'test' } })
      bus.emit({ type: 'e3', payload: {}, source: { component: 'test' } })

      const history = bus.getHistory()
      expect(history.length).toBe(3)
      expect(history[0].type).toBe('e1')
      expect(history[2].type).toBe('e3')
    })

    it('should respect historySize limit (ring buffer)', () => {
      const bus = createEventBus({
        logger: useLogg('test'),
        config: { historySize: 3 },
      })

      bus.emit({ type: 'e1', payload: {}, source: { component: 'test' } })
      bus.emit({ type: 'e2', payload: {}, source: { component: 'test' } })
      bus.emit({ type: 'e3', payload: {}, source: { component: 'test' } })
      bus.emit({ type: 'e4', payload: {}, source: { component: 'test' } })

      const history = bus.getHistory()
      expect(history.length).toBe(3)
      // Oldest event (e1) should be evicted
      expect(history.map(e => e.type)).toEqual(['e2', 'e3', 'e4'])
    })
  })

  describe('getEventsByTrace', () => {
    it('should filter events by traceId', () => {
      const bus = createTestBus()

      const e1 = bus.emit({ type: 'a', payload: {}, source: { component: 'test' } })
      bus.emitChild(e1, { type: 'b', payload: {}, source: { component: 'test' } })
      bus.emit({ type: 'c', payload: {}, source: { component: 'test' } }) // Different trace

      const trace = bus.getEventsByTrace(e1.traceId)
      expect(trace.length).toBe(2)
      expect(trace.map(e => e.type)).toEqual(['a', 'b'])
    })
  })
})
