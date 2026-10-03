import { Buffer } from 'node:buffer'

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
//
// NOTICE:
// Fail closed on save: silently falling back to plaintext when safeStorage is
// unavailable would defeat this fix entirely on hosts without a keychain backend.
// config.update() (below) must reject the whole write rather than persist plaintext.
function encryptApiKey(value: string): string {
  if (!value)
    return value
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Secure storage is unavailable; refusing to persist artistry API key in plaintext')
  return safeStorage.encryptString(value).toString('base64')
}

function decryptApiKey(value: string): string {
  if (!value)
    return value
  if (!safeStorage.isEncryptionAvailable()) {
    // NOTICE:
    // Fail closed on read too, but to "unset" rather than throwing: config.get() is called
    // from many places (image generation, "is provider configured" checks, the get-config
    // IPC handler) that must keep working even when the keychain backend is unavailable.
    // Returning the undecryptable ciphertext as-is would hand callers a bogus "key" string;
    // treating it as absent is the safe, non-crashing choice.
    console.warn('Secure storage unavailable; treating stored artistry API key as unset')
    return ''
  }
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
