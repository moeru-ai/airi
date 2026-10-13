import type { ArtistryTestComfyUIResult } from '@proj-airi/stage-shared'

import { createContext, defineInvoke } from '@moeru/eventa'
import { artistryTestComfyUIConnection } from '@proj-airi/stage-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setupArtistryBridge } from './artistry-bridge'
import { ComfyUIProvider } from './providers/comfyui'

describe('artistryBridge and comfyui provider', () => {
  describe('comfyui provider initialization', () => {
    it('normalizes server url by trimming whitespace and trailing slashes', async () => {
      const provider = new ComfyUIProvider()
      await provider.initialize({
        comfyuiServerUrl: '  http://127.0.0.1:8188///  ',
      })
      expect(provider.getServerUrl()).toBe('http://127.0.0.1:8188')
    })
  })

  describe('artistryTestComfyUIConnection invoke', () => {
    const fetchMock = vi.fn()

    beforeEach(() => {
      vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.clearAllMocks()
    })

    function createMockManager() {
      return {
        updateWidget: vi.fn(),
        pushWidget: vi.fn(),
        getWidgetSnapshot: vi.fn(),
      }
    }

    function createMockConfig() {
      return {
        get: vi.fn(),
        update: vi.fn(),
      }
    }

    it.each([
      { payload: { url: '' } },
      { payload: { url: '   ' } },
      { payload: { url: 123 } },
      { payload: {} },
      { payload: undefined },
    ])('returns ok: false without info when payload is invalid (%j)', async ({ payload }) => {
      const context = createContext()
      await setupArtistryBridge({
        widgetsManager: createMockManager() as never,
        context: context as never,
        artistryConfig: createMockConfig() as never,
      })

      const invokeTest = defineInvoke(context, artistryTestComfyUIConnection) as (input: unknown) => Promise<ArtistryTestComfyUIResult>
      const result = await invokeTest(payload)

      expect(result).toEqual({ ok: false })
      expect(result.info).toBeUndefined()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('trims url and returns connected info when fetch succeeds', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          devices: [{ name: 'NVIDIA RTX 4090', vram_total: 24 * 1024 * 1024 * 1024 }],
        }),
      })

      const context = createContext()
      await setupArtistryBridge({
        widgetsManager: createMockManager() as never,
        context: context as never,
        artistryConfig: createMockConfig() as never,
      })

      const invokeTest = defineInvoke(context, artistryTestComfyUIConnection)
      const result = await invokeTest({ url: '  http://localhost:8188/  ' })

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8188/system_stats', expect.any(Object))
      expect(result.ok).toBe(true)
      expect(result.info).toContain('Connected — NVIDIA RTX 4090')
    })

    it('returns failure info when fetch responds with error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 502,
      })

      const context = createContext()
      await setupArtistryBridge({
        widgetsManager: createMockManager() as never,
        context: context as never,
        artistryConfig: createMockConfig() as never,
      })

      const invokeTest = defineInvoke(context, artistryTestComfyUIConnection)
      const result = await invokeTest({ url: 'http://localhost:8188' })

      expect(result.ok).toBe(false)
      expect(result.info).toBe('Failed: HTTP 502')
    })
  })
})
