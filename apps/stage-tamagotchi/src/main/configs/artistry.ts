import type { InferOutput } from 'valibot'

import type { Config } from '../libs/electron/persistence'

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
    //
    // This does mean a caller cannot tell "really empty" apart from "unavailable right now"
    // from this return value alone. isApiKeyUnavailable() below exists for the one caller
    // (the artistryGetConfig IPC handler) that must make that distinction, since re-syncing
    // this placeholder as if it were a real empty value would permanently erase the
    // ciphertext still sitting on disk. (review: PR #2512 discussion r4179494678)
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

// A non-empty stored (encrypted or legacy-plaintext) value that currently can't be decrypted
// is categorically different from an empty value: the former still holds real ciphertext and
// must never be treated as, or re-synced as, a deletion. Takes the *raw* stored value (as
// returned by ArtistryConfig['getEncrypted'], before decryptApiKey's unset-on-unavailable
// fallback) so it can see past that fallback. (review: PR #2512 discussion r4179494678)
export function isApiKeyUnavailable(rawValue: string): boolean {
  return !!rawValue && !safeStorage.isEncryptionAvailable()
}

export type ArtistryConfig = Config<typeof artistryConfigSchema> & {
  /** Returns the stored value as-is (still encrypted, or legacy plaintext), without decryptApiKey's unset-on-unavailable fallback. Pairs with isApiKeyUnavailable() above. */
  getEncrypted: () => InferOutput<typeof artistryConfigSchema> | undefined
}

export function createArtistryConfig(): ArtistryConfig {
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

  return { ...config, getEncrypted: rawGet }
}
