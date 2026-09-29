import type { ProviderTranslator } from '@proj-airi/provider-inference'

import { getGenerationProvider } from '@proj-airi/provider-inference'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerAppleVision } from '.'

const mocks = vi.hoisted(() => ({
  chat: vi.fn((model = 'system') => ({ model })),
  dispose: vi.fn(),
  isAvailable: vi.fn(),
}))

vi.mock('@moeru/eventa/adapters/electron/renderer', () => ({
  createContext: () => ({ context: {}, dispose: mocks.dispose }),
}))

vi.mock('@proj-airi/stage-shared', () => ({
  isElectronWindow: () => true,
  isStageTamagotchi: () => true,
}))

vi.mock('@xsai-apple-vision/vision-electron-plugin', () => ({
  APPLE_VISION_MODEL: 'system',
  createAppleVisionProvider: () => ({ chat: mocks.chat, isAvailable: mocks.isAvailable }),
}))

const translate = ((key: string) => key) as ProviderTranslator

async function validate() {
  const validator = await providerAppleVision.validators?.validateConfig?.[0]({ t: translate })
  return validator?.validator({}, { t: translate })
}

describe('apple vision provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('reports the availability reason of the main-process Provider', async () => {
    vi.stubGlobal('window', { electron: { ipcRenderer: {} }, platform: 'darwin' })
    mocks.isAvailable.mockResolvedValue({
      available: false,
      reason: { code: 'apple-intelligence-not-enabled', message: 'Apple Intelligence is off.' },
    })

    const result = await validate()

    expect(result?.valid).toBe(false)
    expect(result?.reason).toBe('Apple Intelligence is off.')
    expect(mocks.dispose).toHaveBeenCalledOnce()
  })

  it('passes validation when the model is available', async () => {
    vi.stubGlobal('window', { electron: { ipcRenderer: {} }, platform: 'darwin' })
    mocks.isAvailable.mockResolvedValue({ available: true })

    expect((await validate())?.valid).toBe(true)
  })

  it('serves the vision module with one default model', async () => {
    vi.stubGlobal('window', { electron: { ipcRenderer: {} }, platform: 'darwin' })
    const instance = await providerAppleVision.createProvider({})
    const catalog = await providerAppleVision.extraMethods?.listModelCatalog?.({}, instance)

    expect(providerAppleVision.tasks).not.toContain('chat')
    expect(catalog?.models.map(model => model.id)).toEqual(['system'])
    expect(catalog?.defaultModel).toBe('system')
  })

  // ROOT CAUSE:
  //
  // The vision module passed its stored model, `auto` of the official provider,
  // and Apple Vision rejected it with a 400 response.
  //
  // We fixed this by never passing a model name to the one on-device model.
  it('ignores the stored model name', async () => {
    vi.stubGlobal('window', { electron: { ipcRenderer: {} }, platform: 'darwin' })
    const provider = getGenerationProvider(await providerAppleVision.createProvider({}))

    expect(provider?.generation('auto')).toEqual({ protocol: 'chat-completions', config: { model: 'system' } })
  })

  it('is unavailable outside macOS', async () => {
    vi.stubGlobal('window', { electron: { ipcRenderer: {} }, platform: 'win32' })

    expect(await providerAppleVision.isAvailableBy?.()).toBe(false)
    expect((await validate())?.reason).toBe('Apple Vision requires the macOS desktop app.')
  })
})
