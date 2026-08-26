import { describe, expect, it } from 'vitest'

import {
  normalizeOptionalWidgetId,
  normalizeRequiredWidgetId,
  validateWidgetIframeRequestResult,
  validateWidgetsAddPayload,
  validateWidgetsUpdatePayload,
} from './validation'

describe('widget invoke validation', () => {
  describe('validateWidgetsAddPayload', () => {
    it('normalizes add payloads for the widgets manager', () => {
      expect(validateWidgetsAddPayload({
        id: ' widget-1 ',
        componentName: ' weather ',
        componentProps: { city: 'Tokyo' },
        alwaysOnTop: true,
        ttlMs: 2500.9,
        windowSize: {
          width: 620.8,
          height: 480.2,
          minWidth: 320.9,
        },
      })).toEqual({
        id: 'widget-1',
        componentName: 'weather',
        componentProps: { city: 'Tokyo' },
        alwaysOnTop: true,
        ttlMs: 2500,
        windowSize: {
          width: 620,
          height: 480,
          minWidth: 320,
        },
      })
    })

    it('rejects empty component names and invalid payload fields', () => {
      expect(() => validateWidgetsAddPayload({
        componentName: '   ',
      } as any)).toThrow('componentName is required to spawn a widget.')

      expect(() => validateWidgetsAddPayload({
        componentName: 'weather',
        componentProps: [] as any,
      })).toThrow('componentProps must be a plain object.')

      expect(() => validateWidgetsAddPayload({
        componentName: 'weather',
        ttlMs: -1,
      })).toThrow('ttlMs must be a non-negative finite number.')

      expect(() => validateWidgetsAddPayload({
        componentName: 'weather',
        windowSize: { width: 0, height: 320 },
      } as any)).toThrow('windowSize must contain a positive finite width and height.')

      expect(() => validateWidgetsAddPayload({
        componentName: 'weather',
        alwaysOnTop: 'yes' as any,
      })).toThrow('alwaysOnTop must be a boolean when provided.')
    })
  })

  describe('validateWidgetsUpdatePayload', () => {
    it('normalizes widget updates and keeps optional fields optional', () => {
      expect(validateWidgetsUpdatePayload({
        id: ' widget-1 ',
        componentProps: { city: 'Taipei' },
        alwaysOnTop: false,
        ttlMs: 1500.4,
      })).toEqual({
        id: 'widget-1',
        componentProps: { city: 'Taipei' },
        alwaysOnTop: false,
        ttlMs: 1500,
        windowSize: undefined,
      })
    })

    it('rejects missing ids and malformed update fields', () => {
      expect(() => validateWidgetsUpdatePayload({
        id: '   ',
      } as any)).toThrow('id is required to update a widget.')

      expect(() => validateWidgetsUpdatePayload({
        id: 'widget-1',
        componentProps: [] as any,
      })).toThrow('componentProps must be a plain object.')

      expect(() => validateWidgetsUpdatePayload({
        id: 'widget-1',
        windowSize: { width: Number.NaN, height: 400 },
      } as any)).toThrow('windowSize must contain a positive finite width and height.')

      expect(() => validateWidgetsUpdatePayload({
        id: 'widget-1',
        alwaysOnTop: 'yes' as any,
      })).toThrow('alwaysOnTop must be a boolean when provided.')
    })
  })

  describe('widget id normalization helpers', () => {
    it('normalizes optional ids for open/prepare flows', () => {
      expect(normalizeOptionalWidgetId(' widget-1 ')).toBe('widget-1')
      expect(normalizeOptionalWidgetId('   ')).toBeUndefined()
    })

    it('enforces required ids for destructive flows', () => {
      expect(normalizeRequiredWidgetId(' widget-1 ', 'id required')).toBe('widget-1')
      expect(() => normalizeRequiredWidgetId('   ', 'id required')).toThrow('id required')
    })
  })

  describe('validateWidgetIframeRequestResult', () => {
    it('normalizes successful iframe request results', () => {
      expect(validateWidgetIframeRequestResult({
        id: ' kit-module:board ',
        requestId: ' req-1 ',
        ok: true,
        result: { fen: 'fen-after-request' },
      })).toEqual({
        id: 'kit-module:board',
        requestId: 'req-1',
        ok: true,
        result: { fen: 'fen-after-request' },
      })
    })

    it('normalizes failed iframe request results', () => {
      expect(validateWidgetIframeRequestResult({
        id: 'kit-module:board',
        requestId: 'req-1',
        ok: false,
        error: 'Board rejected request.',
      })).toEqual({
        id: 'kit-module:board',
        requestId: 'req-1',
        ok: false,
        error: 'Board rejected request.',
      })
    })

    it('rejects malformed iframe request results', () => {
      expect(() => validateWidgetIframeRequestResult(null)).toThrow('iframe request result must be a plain object.')
      expect(() => validateWidgetIframeRequestResult({
        id: 'kit-module:board',
        requestId: 'req-1',
        ok: true,
      })).toThrow('iframe request result payload must be a plain object.')
      expect(() => validateWidgetIframeRequestResult({
        id: 'kit-module:board',
        requestId: 'req-1',
        ok: false,
      })).toThrow('iframe request result error is required.')
    })
  })
})
