import type { WidgetInvokers } from './widgets'

import { describe, expect, it, vi } from 'vitest'

import { executeWidgetAction, normalizeComponentProps } from './widgets'

describe('widgets tool helpers', () => {
  describe('normalizeComponentProps', () => {
    it('parses JSON strings into objects', () => {
      const result = normalizeComponentProps('{"city":"Tokyo","temp":15}')
      expect(result).toEqual({ city: 'Tokyo', temp: 15 })
    })

    it('returns empty object for empty or undefined', () => {
      expect(normalizeComponentProps('   ')).toEqual({})
      expect(normalizeComponentProps(undefined)).toEqual({})
      expect(normalizeComponentProps(null as any)).toEqual({})
    })

    it('passes through object inputs', () => {
      const payload = { foo: 'bar', nested: { a: 1 } }
      expect(normalizeComponentProps(payload)).toBe(payload)
    })

    it('throws on invalid JSON', () => {
      expect(() => normalizeComponentProps('{ bad json ')).toThrow()
    })
  })
  describe('executeWidgetAction with mocked invokers', () => {
    const makeInvokers = (): WidgetInvokers => ({
      prepareWindow: vi.fn(),
      openWindow: vi.fn(),
      addWidget: vi.fn(),
      updateWidget: vi.fn(),
      removeWidget: vi.fn(),
      clearWidgets: vi.fn(),
    })

    it('spawns with ttl conversion and parsed props', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('abc123')

      const result = await executeWidgetAction({
        action: 'spawn',
        id: ' abc123 ',
        componentName: 'weather',
        componentProps: '{"city":"Tokyo"}',
        size: 'm',
        ttlSeconds: 2,
      }, { invokers })

      expect(result).toContain('abc123')
      expect(invokers.addWidget).toHaveBeenCalledTimes(1)
      expect(invokers.addWidget).toHaveBeenCalledWith({
        id: 'abc123',
        componentName: 'weather',
        componentProps: { city: 'Tokyo' },
        size: 'm',
        ttlMs: 2000,
      })
    })

    it('updates props and trims id', async () => {
      const invokers = makeInvokers()
      await executeWidgetAction({
        action: 'update',
        id: ' xyz ',
        componentName: '',
        componentProps: '{"foo":1}',
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.updateWidget).toHaveBeenCalledWith({ id: 'xyz', componentProps: { foo: 1 } })
    })

    it('removes when id provided', async () => {
      const invokers = makeInvokers()
      await executeWidgetAction({
        action: 'remove',
        id: 'rem-id',
        componentName: '',
        componentProps: '{}',
        size: 's',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.removeWidget).toHaveBeenCalledWith({ id: 'rem-id' })
    })

    it('opens window with prepared id', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.prepareWindow).mockResolvedValue('prepared-id')
      await executeWidgetAction({
        action: 'open',
        id: '  prepared-id ',
        componentName: '',
        componentProps: '{}',
        size: 'l',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.prepareWindow).toHaveBeenCalledWith({ id: 'prepared-id' })
      expect(invokers.openWindow).toHaveBeenCalledWith({ id: 'prepared-id' })
    })

    it('clears widgets', async () => {
      const invokers = makeInvokers()
      await executeWidgetAction({
        action: 'clear',
        id: '',
        componentName: '',
        componentProps: '{}',
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.clearWidgets).toHaveBeenCalledTimes(1)
    })
  })
})
