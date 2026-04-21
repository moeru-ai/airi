import type { WidgetInvokers } from './widgets'

import { describe, expect, it, vi } from 'vitest'

import { canRenderExtensionUi, sanitizeExtensionUiRenderProps } from '../../../widgets/extension-ui/host'
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

    it('forwards custom window sizing when spawning a widget', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('sized-widget')

      await executeWidgetAction({
        action: 'spawn',
        id: ' sized-widget ',
        componentName: 'weather',
        componentProps: '{"city":"Taipei"}',
        size: 'l',
        ttlSeconds: 0,
        windowSize: {
          width: 620,
          height: 760,
          minWidth: 480,
          minHeight: 320,
        },
      } as any, { invokers })

      expect(invokers.addWidget).toHaveBeenCalledWith({
        id: 'sized-widget',
        componentName: 'weather',
        componentProps: { city: 'Taipei' },
        size: 'l',
        ttlMs: 0,
        windowSize: {
          width: 620,
          height: 760,
          minWidth: 480,
          minHeight: 320,
        },
      })
    })

    it('preserves extension-ui payloads when spawning dynamic modules', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('chess-main')

      await executeWidgetAction({
        action: 'spawn',
        id: ' chess-main ',
        componentName: 'extension-ui',
        componentProps: JSON.stringify({
          moduleId: 'chess-main',
          title: 'Extension UI',
          windowSize: {
            width: 720,
            height: 540,
            minWidth: 480,
          },
          payload: {
            side: 'white',
          },
        }),
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      expect(invokers.addWidget).toHaveBeenCalledWith(expect.objectContaining({
        id: 'chess-main',
        componentName: 'extension-ui',
        componentProps: expect.objectContaining({
          moduleId: 'chess-main',
          title: 'Extension UI',
          windowSize: {
            width: 720,
            height: 540,
            minWidth: 480,
          },
          payload: {
            side: 'white',
          },
        }),
        windowSize: {
          width: 720,
          height: 540,
          minWidth: 480,
        },
      }))
    })

    it('sanitizes reserved extension-ui host props before dispatch', async () => {
      const invokers = makeInvokers()
      vi.mocked(invokers.addWidget).mockResolvedValue('guarded-main')

      await executeWidgetAction({
        action: 'spawn',
        id: ' guarded-main ',
        componentName: 'extension-ui',
        componentProps: JSON.stringify({
          'moduleId': 'guarded-main',
          'title': 'Guarded Module',
          'modelValue': { injected: true },
          'module': { injected: true },
          'moduleConfig': { injected: true },
          'model-value': { injected: true },
          'module-config': { injected: true },
          'payload': {
            safe: true,
          },
        }),
        size: 'm',
        ttlSeconds: 0,
      }, { invokers })

      const dispatched = vi.mocked(invokers.addWidget).mock.calls[0]?.[0]
      expect(dispatched).toBeDefined()
      expect(dispatched?.componentProps).toMatchObject({
        moduleId: 'guarded-main',
        title: 'Guarded Module',
        payload: {
          safe: true,
        },
      })
      expect(dispatched?.componentProps).not.toHaveProperty('modelValue')
      expect(dispatched?.componentProps).not.toHaveProperty('module')
      expect(dispatched?.componentProps).not.toHaveProperty('moduleConfig')
      expect(dispatched?.componentProps).not.toHaveProperty('model-value')
      expect(dispatched?.componentProps).not.toHaveProperty('module-config')
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

  describe('extension-ui host helpers', () => {
    it('removes host-controlled render props from payload props', () => {
      expect(sanitizeExtensionUiRenderProps({
        'title': 'Override',
        'modelValue': { injected: true },
        'module': { injected: true },
        'moduleConfig': { injected: true },
        'model-value': { injected: true },
        'module-config': { injected: true },
        'safe': true,
      })).toEqual({
        safe: true,
      })
    })

    it('requires a registered module before rendering a resolved widget', () => {
      expect(canRenderExtensionUi({
        loading: false,
        moduleSnapshot: undefined,
        iframeSrc: 'https://example.com',
      })).toBe(false)

      expect(canRenderExtensionUi({
        loading: false,
        error: 'module missing',
        moduleSnapshot: {
          moduleId: 'module-1',
          ownerSessionId: 'session-1',
          ownerPluginId: 'plugin-1',
          kitId: 'kit.widget',
          kitModuleType: 'window',
          state: 'active',
          runtime: 'electron',
          revision: 1,
          updatedAt: Date.now(),
          config: {},
        },
        iframeSrc: 'https://example.com',
      })).toBe(false)
    })
  })
})
