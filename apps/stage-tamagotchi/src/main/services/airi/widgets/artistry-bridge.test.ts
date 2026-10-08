import { createContext, defineInvoke } from '@moeru/eventa'
import { artistrySyncConfig, artistryTestComfyUIConnection } from '@proj-airi/stage-shared'
import { injeca } from 'injeca'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateHeadless, setupArtistryBridge } from './artistry-bridge'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('steam drawing execution restrictions', () => {
  it('rejects generation before resolving saved configuration', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    const resolve = vi.spyOn(injeca, 'resolve').mockRejectedValue(new Error('Configuration access is forbidden in this test'))
    const result = await generateHeadless({ prompt: 'Draw a blue square' }).catch(() => null)
    expect(resolve).not.toHaveBeenCalled()
    expect(result).toEqual({
      error: 'Image generation is not available in the Steam edition.',
    })
  })

  it('rejects config sync and ComfyUI probes through IPC', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    const context = createContext()
    const update = vi.fn()
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}))
    const widgetsManager = {
      getWidgetSnapshot: vi.fn(),
      updateWidget: vi.fn(),
      pushWidget: vi.fn(),
    }
    await setupArtistryBridge({
      context: context as never,
      widgetsManager: widgetsManager as never,
      artistryConfig: { update, get: () => ({ artistryGlobals: {} }) } as never,
    })
    await defineInvoke(context, artistrySyncConfig)({ provider: 'comfyui', globals: {} })
    expect(update).not.toHaveBeenCalled()
    expect(await defineInvoke(context, artistryTestComfyUIConnection)({ url: 'http://localhost:8188' })).toEqual({
      ok: false,
      info: 'Image generation is not available in the Steam edition.',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
