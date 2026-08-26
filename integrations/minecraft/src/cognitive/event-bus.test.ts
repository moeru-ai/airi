import type { TracedEvent } from './event-bus'

import { describe, expect, it, vi } from 'vitest'

import { createEventBus } from './event-bus'

describe('eventBus', () => {
  const createTestBus = () => createEventBus()

  describe('emit', () => {
    it('should create an event with auto-generated id and timestamp', () => {
      const bus = createTestBus()

      const event = bus.emit({
        payload: { foo: 'bar' },
        source: { component: 'test' },
        traceId: 'trace-1',
        type: 'test:event',
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
        payload: {},
        source: { component: 'test' },
        type: 'test:event',
      })

      expect(event.traceId).toBeDefined()
      expect(event.traceId.length).toBe(16)
    })

    it('should freeze the event (immutable)', () => {
      const bus = createTestBus()

      const event = bus.emit({
        payload: { mutable: 'data' },
        source: { component: 'test' },
        type: 'test:event',
      })

      expect(Object.isFrozen(event)).toBe(true)
      expect(Object.isFrozen(event.payload)).toBe(true)
      expect(Object.isFrozen(event.source)).toBe(true)
    })

    it('should deep freeze nested objects in payload', () => {
      const bus = createTestBus()

      const event = bus.emit({
        payload: {
          array: [{ item: 1 }, { item: 2 }],
          level1: {
            level2: {
              value: 42,
            },
          },
        },
        source: { component: 'test' },
        type: 'test:event',
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
        payload: {},
        source: { component: 'test' },
        type: 'parent:event',
      })

      const child = bus.emitChild(parent, {
        payload: { derived: true },
        source: { component: 'test' },
        type: 'child:event',
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
        payload: { data: 123 },
        source: { component: 'test' },
        type: 'test:event',
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].payload).toEqual({ data: 123 })
    })

    it('should support wildcard patterns', () => {
      const bus = createTestBus()
      const handler = vi.fn()

      bus.subscribe('raw:*', handler)

      bus.emit({
        payload: {},
        source: { component: 'test' },
        type: 'raw:sighted:punch',
      })
      bus.emit({
        payload: {},
        source: { component: 'test' },
        type: 'raw:heard:sound',
      })
      bus.emit({
        payload: {},
        source: { component: 'test' },
        type: 'signal:attention',
      })

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('should return unsubscribe function', () => {
      const bus = createTestBus()
      const handler = vi.fn()

      const unsub = bus.subscribe('test:*', handler)

      bus.emit({
        payload: {},
        source: { component: 'test' },
        type: 'test:one',
      })
      expect(handler).toHaveBeenCalledTimes(1)

      unsub()

      bus.emit({
        payload: {},
        source: { component: 'test' },
        type: 'test:two',
      })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('should report subscriber errors while keeping dispatch resilient', () => {
      const onSubscriberError = vi.fn()
      const bus = createEventBus({ onSubscriberError })
      const healthyHandler = vi.fn()
      const subscriberError = new Error('subscriber failed')

      bus.subscribe('test:event', () => {
        throw subscriberError
      })
      bus.subscribe('test:event', healthyHandler)

      const emittedEvent = bus.emit({
        payload: { value: 1 },
        source: { component: 'test' },
        type: 'test:event',
      })

      expect(healthyHandler).toHaveBeenCalledTimes(1)
      expect(onSubscriberError).toHaveBeenCalledTimes(1)
      expect(onSubscriberError).toHaveBeenCalledWith({
        error: subscriberError,
        event: emittedEvent,
        pattern: 'test:event',
      })
    })
  })

  describe('trace context propagation', () => {
    it('should propagate trace context in handlers', () => {
      const bus = createTestBus()
      let childEvent: TracedEvent | undefined

      bus.subscribe('parent:event', () => {
        childEvent = bus.emit({
          payload: {},
          source: { component: 'handler' },
          type: 'child:event',
        })
      })

      const parent = bus.emit({
        payload: {},
        source: { component: 'test' },
        type: 'parent:event',
      })

      expect(childEvent).toBeDefined()
      expect(childEvent!.traceId).toBe(parent.traceId)
      expect(childEvent!.parentId).toBe(parent.id)
    })
  })
})
