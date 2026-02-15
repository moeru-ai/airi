import type { TracedEvent } from './event-bus'

import { describe, expect, it, vi } from 'vitest'

import { createEventBus } from './event-bus'

describe('eventBus', () => {
  const createTestBus = () => createEventBus()

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
      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe('trace context propagation', () => {
    it('should propagate trace context in handlers', () => {
      const bus = createTestBus()
      let childEvent: TracedEvent | undefined

      bus.subscribe('parent:event', () => {
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
})
