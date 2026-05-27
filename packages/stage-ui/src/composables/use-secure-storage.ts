import type { Ref } from 'vue'

import localforage from 'localforage'

import { ref, toRaw, watch } from 'vue'

const KEY_NAME = 'airi_secure_master_key'

async function getMasterKey(): Promise<CryptoKey> {
  const rawKey = await localforage.getItem<ArrayBuffer>(KEY_NAME)
  if (rawKey) {
    return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  }
  const newKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const exported = await crypto.subtle.exportKey('raw', newKey)
  await localforage.setItem(KEY_NAME, exported)
  return newKey
}

/**
 * An encrypted version of useLocalStorage that encrypts and decrypts values with AES-GCM using a master key from IndexedDB.
 *
 * Use when:
 * - Persisting sensitive configurations like API keys and credentials locally.
 * - Restoring from previously plaintext values (automatic migration to encrypted format).
 *
 * Expects:
 * - Web Crypto API to be available globally.
 * - localforage to contain or generate a master key.
 *
 * Returns:
 * - A reactive Ref initialized with initial value or restored/migrated value.
 */
export function useSecureStorage<T>(key: string, initialValue: T): Ref<T> {
  const state = ref<T>(initialValue) as Ref<T>
  let isReady = false

  async function encryptAndSave(newVal: T) {
    try {
      const cryptoKey = await getMasterKey()
      const text = JSON.stringify(toRaw(newVal))
      const encoded = new TextEncoder().encode(text)
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded)

      const combined = new Uint8Array(12 + encrypted.byteLength)
      combined.set(iv)
      combined.set(new Uint8Array(encrypted), 12)

      let binaryString = ''
      for (let i = 0; i < combined.byteLength; i++) {
        binaryString += String.fromCharCode(combined[i])
      }
      const base64 = btoa(binaryString)
      localStorage.setItem(key, base64)
    }
    catch (e) {
      console.error('Failed to encrypt storage key:', key, e)
    }
  }

  getMasterKey().then(async (cryptoKey) => {
    const encryptedBase64 = localStorage.getItem(key)
    if (encryptedBase64) {
      let isPlaintextJson = false
      const trimmed = encryptedBase64.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed)
          state.value = parsed
          isPlaintextJson = true
          await encryptAndSave(parsed)
        }
        catch {
          // Fall back to decryption if JSON parsing fails
        }
      }

      if (!isPlaintextJson) {
        try {
          const binaryString = atob(encryptedBase64)
          const raw = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            raw[i] = binaryString.charCodeAt(i)
          }

          const iv = raw.slice(0, 12)
          const data = raw.slice(12)
          const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data)
          const text = new TextDecoder().decode(decrypted)
          state.value = JSON.parse(text)
        }
        catch (e) {
          console.error('Failed to decrypt storage key:', key, e)
          // Leave state.value as initialValue
        }
      }
    }
    isReady = true
  })

  watch(state, async (newVal) => {
    if (!isReady)
      return
    await encryptAndSave(newVal)
  }, { deep: true })

  return state
}
