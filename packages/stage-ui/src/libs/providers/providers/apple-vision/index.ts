import type { ProviderModelCatalog } from '../../types'

import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { errorMessageFrom } from '@moeru/std'
import { isElectronWindow, isStageTamagotchi } from '@proj-airi/stage-shared'
import { APPLE_VISION_MODEL, createAppleVisionProvider as createElectronProvider } from '@xsai-apple-vision/vision-electron-plugin'
import { z } from 'zod'

import { defineProvider } from '../registry'

const PROVIDER_ID = 'apple-vision'
type ProviderId = typeof PROVIDER_ID

const configSchema = z.object({})

type Config = z.input<typeof configSchema>

/** Returns the window when it is the macOS desktop app, where the main process owns the native addon. */
function findHostWindow() {
  if (!isStageTamagotchi() || typeof window === 'undefined' || !isElectronWindow(window) || window.platform !== 'darwin')
    return undefined
  return window
}

function requireHostWindow() {
  const hostWindow = findHostWindow()
  if (!hostWindow)
    throw new Error('Apple Vision requires the macOS desktop app.')
  return hostWindow
}

function createRendererProvider() {
  const eventa = createContext(requireHostWindow().electron.ipcRenderer)
  const provider = createElectronProvider({ context: eventa.context })
  return {
    // Apple Foundation Models has one on-device model. The addon rejects any
    // other name, so a stored model name never reaches it.
    chat: () => provider.chat(),
    dispose() {
      eventa.dispose()
    },
  }
}

/**
 * Whether this Mac can load the addon, which needs macOS 27 or later on Apple
 * silicon. The check reads the languages instead of the availability, because
 * an availability check starts the OCR preparation in the main process. The
 * validator reports the availability after the user adds the provider.
 */
async function canLoadAddon() {
  const hostWindow = findHostWindow()
  if (!hostWindow)
    return false

  const { context, dispose } = createContext(hostWindow.electron.ipcRenderer)
  try {
    await createElectronProvider({ context }).supportedLanguages()
    return true
  }
  catch {
    return false
  }
  finally {
    dispose()
  }
}

/** Reads the availability reason from the main-process Provider. See xsai-apple-vision ADR-0004. */
async function checkAvailability() {
  const { context, dispose } = createContext(requireHostWindow().electron.ipcRenderer)
  try {
    return await createElectronProvider({ context }).isAvailable()
  }
  finally {
    dispose()
  }
}

/** Apple Foundation Models exposes one on-device model, so the catalog is fixed. */
async function listModelCatalog(): Promise<ProviderModelCatalog> {
  return {
    models: [{
      id: APPLE_VISION_MODEL,
      name: 'Apple Foundation Model',
      provider: PROVIDER_ID,
      description: 'The on-device model of Apple Foundation Models',
    }],
    defaultModel: APPLE_VISION_MODEL,
  }
}

export const providerAppleVision = defineProvider<Config, ProviderId>({
  id: PROVIDER_ID,
  name: 'Apple Vision',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.apple-vision.title'),
  description: 'On-device image understanding with Apple Foundation Models on macOS 27 or later. No API key is required.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.apple-vision.description'),
  // The on-device model has a small context window and no tool calls, so it
  // serves the vision module only.
  tasks: ['vision', 'image-understanding'],
  isAvailableBy: canLoadAddon,
  // The on-device model answers one request at a time.
  capabilities: { vision: { concurrentReads: 1 } },

  createProviderConfig: () => configSchema,
  createProvider: createRendererProvider,

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
            const availability = await checkAvailability()
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
    listModelCatalog,
  },
})
