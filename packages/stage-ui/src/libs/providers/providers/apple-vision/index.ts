import type { ProviderModelCatalog } from '../../types'

import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { isElectronWindow, isStageTamagotchi } from '@proj-airi/stage-shared'
import { APPLE_VISION_MODEL, createAppleVisionProvider as createElectronAppleVisionProvider } from '@xsai-apple-vision/vision-electron-plugin'
import { z } from 'zod'

import { defineProvider } from '../registry'

export const APPLE_VISION_PROVIDER_ID = 'apple-vision'
type AppleVisionProviderId = typeof APPLE_VISION_PROVIDER_ID

const appleVisionConfigSchema = z.object({})

type AppleVisionConfig = z.input<typeof appleVisionConfigSchema>

/** Returns the window when it is the macOS desktop app, where the main process owns the native addon. */
function appleVisionHostWindow() {
  if (!isStageTamagotchi() || typeof window === 'undefined' || !isElectronWindow(window) || window.platform !== 'darwin')
    return undefined
  return window
}

function requireAppleVisionHostWindow() {
  const hostWindow = appleVisionHostWindow()
  if (!hostWindow)
    throw new Error('Apple Vision requires the macOS desktop app.')
  return hostWindow
}

function createRendererAppleVisionProvider() {
  const eventa = createContext(requireAppleVisionHostWindow().electron.ipcRenderer)
  const provider = createElectronAppleVisionProvider({ context: eventa.context })
  return {
    // Apple Foundation Models has one on-device model. A stored model name, such
    // as `auto` of another provider, never reaches the addon.
    chat: () => provider.chat(),
    dispose() {
      eventa.dispose()
    },
  }
}

/** Reads the availability reason from the main-process Provider. See xsai-apple-vision ADR-0004. */
async function checkAppleVisionAvailability() {
  const { context, dispose } = createContext(requireAppleVisionHostWindow().electron.ipcRenderer)
  try {
    return await createElectronAppleVisionProvider({ context }).isAvailable()
  }
  finally {
    dispose()
  }
}

/** Apple Foundation Models exposes one on-device model, so the catalog is fixed. */
async function listAppleVisionModelCatalog(): Promise<ProviderModelCatalog> {
  return {
    models: [{
      id: APPLE_VISION_MODEL,
      name: 'Apple Foundation Model',
      provider: APPLE_VISION_PROVIDER_ID,
      description: 'The on-device model of Apple Foundation Models',
    }],
    defaultModel: APPLE_VISION_MODEL,
  }
}

export const providerAppleVision = defineProvider<AppleVisionConfig, AppleVisionProviderId>({
  id: APPLE_VISION_PROVIDER_ID,
  name: 'Apple Vision',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.apple-vision.title'),
  description: 'On-device image understanding with Apple Foundation Models on macOS 27 or later. No API key is required.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.apple-vision.description'),
  // The on-device model has a small context window and no tool calls, so it
  // serves the vision module only.
  tasks: ['vision', 'image-understanding'],
  isAvailableBy: () => appleVisionHostWindow() != null,

  createProviderConfig: () => appleVisionConfigSchema,
  createProvider: createRendererAppleVisionProvider,

  validationRequiredWhen: () => true,
  validators: {
    validateConfig: [
      ({ t }) => ({
        id: 'apple-vision:check-availability',
        name: t('settings.pages.providers.catalog.edit.validators.apple-vision.check-availability.title'),
        schedule: {
          mode: 'interval',
          intervalMs: 15_000,
        },
        validator: async () => {
          let reason = ''
          try {
            const availability = await checkAppleVisionAvailability()
            if (!availability.available)
              reason = availability.reason.message
          }
          catch (error) {
            reason = errorMessageFrom(error) ?? 'Unknown error.'
          }
          return {
            errors: reason ? [{ error: new Error(reason) }] : [],
            reason,
            reasonKey: '',
            valid: !reason,
          }
        },
      }),
    ],
  },

  extraMethods: {
    listModelCatalog: listAppleVisionModelCatalog,
  },
})
