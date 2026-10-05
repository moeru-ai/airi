import type { InferOutput } from 'valibot'

import type { Config } from '../libs/electron/persistence'

import { Buffer } from 'node:buffer'

import { safeStorage } from 'electron'
import { isLinux } from 'std-env'
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

const LINUX_SECURE_STORAGE_BACKENDS = new Set<ReturnType<typeof safeStorage.getSelectedStorageBackend>>([
  'gnome_libsecret',
  'kwallet',
  'kwallet5',
  'kwallet6',
])

// isEncryptionAvailable() alone doesn't guarantee an OS keychain actually protects the
// ciphertext: on Linux, when no secret service (gnome-keyring/kwallet) is found, Electron
// falls back to a 'basic_text' backend that encrypts with a hardcoded password baked into
// the binary, recoverable without any user secret. 'unknown' (returned before the app's
// 'ready' event) is equally untrustworthy -- we simply don't know yet. Windows/macOS always
// have a real OS-backed keychain, so isEncryptionAvailable() alone is sufficient there.
// Source: https://www.electronjs.org/docs/latest/api/safe-storage#synchronous-api
// (review: PR #2512 discussion r4180458796)
function isSecureStorageAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable())
    return false
  if (!isLinux)
    return true
  return LINUX_SECURE_STORAGE_BACKENDS.has(safeStorage.getSelectedStorageBackend())
}

// Tags our own ciphertext so a later read never has to guess whether a stored value is
// legacy pre-encryption plaintext or ciphertext that failed to decrypt -- see decryptApiKey's
// NOTICE below for why that distinction can't be made reliably any other way.
export const ENCRYPTED_VALUE_PREFIX = 'enc:v1:'

function encryptApiKey(value: string): string {
  if (!value)
    return value
  if (!isSecureStorageAvailable())
    throw new Error('Secure storage is unavailable; refusing to persist artistry API key in plaintext')
  return ENCRYPTED_VALUE_PREFIX + safeStorage.encryptString(value).toString('base64')
}

interface DecryptedApiKey {
  value: string
  /**
   * True when a non-empty stored value exists but couldn't be decrypted right now (keychain
   * unavailable, or ciphertext that fails to decrypt even though the keychain is available --
   * e.g. restored on a different machine/OS user, corruption, a rotated keychain key).
   * Categorically different from a genuinely empty key: the ciphertext is still intact on
   * disk and must never be treated as, or re-synced as, a deletion.
   */
  unavailable: boolean
}

function decryptApiKey(value: string): DecryptedApiKey {
  if (!value)
    return { value: '', unavailable: false }

  if (!value.startsWith(ENCRYPTED_VALUE_PREFIX)) {
    // No marker: genuine pre-encryption plaintext, written before this app version ever
    // encrypted this field. Not ciphertext, so there's nothing to fail at -- return as-is;
    // the next successful save re-persists it encrypted.
    return { value, unavailable: false }
  }

  if (!isSecureStorageAvailable()) {
    // NOTICE:
    // Fail closed on read too, but to "unset" rather than throwing: config.get() is called
    // from many places (image generation, "is provider configured" checks, the get-config
    // IPC handler) that must keep working even when the keychain backend is unavailable.
    // Returning the undecryptable ciphertext as-is would hand callers a bogus "key" string;
    // treating it as absent is the safe, non-crashing choice. isApiKeyUnavailable() below
    // exists for the one caller (the artistryGetConfig IPC handler) that must distinguish
    // this from a real empty value, since re-syncing this placeholder as if it were real
    // would permanently erase the ciphertext still sitting on disk.
    // (review: PR #2512 discussion r4179494678)
    console.warn('Secure storage unavailable; treating stored artistry API key as unset')
    return { value: '', unavailable: true }
  }

  try {
    const ciphertext = value.slice(ENCRYPTED_VALUE_PREFIX.length)
    return { value: safeStorage.decryptString(Buffer.from(ciphertext, 'base64')), unavailable: false }
  }
  catch {
    // NOTICE:
    // The ENCRYPTED_VALUE_PREFIX marker confirms this is our own ciphertext, not legacy
    // plaintext -- so a decrypt failure here (keychain available, but decryptString itself
    // throws) must not fall back to returning the raw bytes. Those bytes are base64
    // ciphertext, not a usable key: handing them out as "the key" would let a caller re-sync
    // them through encryptApiKey, double-encrypting and permanently destroying the original
    // value. Report unavailable instead, matching the keychain-unavailable branch above.
    // (review: PR #2512 discussion r4180458798)
    console.warn('Stored artistry API key ciphertext could not be decrypted; treating as unavailable')
    return { value: '', unavailable: true }
  }
}

// Thin delegate so callers that only need the yes/no answer (the artistryGetConfig IPC
// handler) can't disagree with what decryptApiKey itself actually determines.
export function isApiKeyUnavailable(rawValue: string): boolean {
  return decryptApiKey(rawValue).unavailable
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
        replicateApiKey: decryptApiKey(value.artistryGlobals.replicateApiKey).value,
        nanobananaApiKey: decryptApiKey(value.artistryGlobals.nanobananaApiKey).value,
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
