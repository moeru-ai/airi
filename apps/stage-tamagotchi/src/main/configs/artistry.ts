import { safeStorage } from 'electron'
import { any, array, number, object, optional, string } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

export const artistryConfigSchema = object({
  artistryProvider: optional(string(), 'none'),
  artistryGlobals: optional(object({
    comfyuiServerUrl: optional(string(), 'http://localhost:8188'),
    comfyuiSavedWorkflows: optional(array(any()), []),
    comfyuiActiveWorkflow: optional(string(), ''),
    replicateApiKey: optional(string(), ''),
    replicateDefaultModel: optional(string(), 'black-forest-labs/flux-schnell'),
    replicateAspectRatio: optional(string(), '16:9'),
    replicateInferenceSteps: optional(number(), 4),
    nanobananaApiKey: optional(string(), ''),
    nanobananaModel: optional(string(), 'gemini-3.1-flash-image-preview'),
    nanobananaResolution: optional(string(), '1K'),
  }), {}),
})

// Replicate/Nanobanana API keys must not be persisted in plaintext on disk.
// Encrypt them at rest with the OS keychain-backed Electron safeStorage API.
function encryptApiKey(value: string): string {
  if (!value || !safeStorage.isEncryptionAvailable())
    return value
  return safeStorage.encryptString(value).toString('base64')
}

function decryptApiKey(value: string): string {
  if (!value || !safeStorage.isEncryptionAvailable())
    return value
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  }
  catch {
    // Value predates encryption support (legacy plaintext) or is not decryptable here.
    return value
  }
}

export function createArtistryConfig() {
  const config = createConfig('artistry', 'options.json', artistryConfigSchema)
  config.setup()

  const rawGet = config.get
  const rawUpdate = config.update

  config.get = () => {
    const value = rawGet()
    if (!value?.artistryGlobals)
      return value
    return {
      ...value,
      artistryGlobals: {
        ...value.artistryGlobals,
        replicateApiKey: decryptApiKey(value.artistryGlobals.replicateApiKey),
        nanobananaApiKey: decryptApiKey(value.artistryGlobals.nanobananaApiKey),
      },
    }
  }

  config.update = newData => rawUpdate({
    ...newData,
    artistryGlobals: {
      ...newData.artistryGlobals,
      replicateApiKey: encryptApiKey(newData.artistryGlobals.replicateApiKey),
      nanobananaApiKey: encryptApiKey(newData.artistryGlobals.nanobananaApiKey),
    },
  })

  return config
}
