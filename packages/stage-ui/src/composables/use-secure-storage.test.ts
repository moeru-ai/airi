import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSecureStorage } from './use-secure-storage'

const localforageStore: Record<string, any> = {}

vi.mock('localforage', () => ({
  default: {
    getItem: vi.fn().mockImplementation(async (key: string) => localforageStore[key] || null),
    setItem: vi.fn().mockImplementation(async (key: string, val: any) => {
      localforageStore[key] = val
      return val
    }),
  },
}))

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Test suite for the useSecureStorage composable.
 *
 * @example
 * ```ts
 * describe('useSecureStorage', () => {
 *   it('should encrypt and decrypt values', async () => {
 *     // ...
 *   })
 * })
 * ```
 */
describe('useSecureStorage', () => {
  let storageState: Record<string, string>
  let localStorageMock: any

  beforeEach(() => {
    storageState = {}
    localStorageMock = {
      getItem: vi.fn((key: string) => storageState[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storageState[key] = value }),
      removeItem: vi.fn((key: string) => { delete storageState[key] }),
      clear: vi.fn(() => { for (const key in storageState) delete storageState[key] }),
      length: 0,
      key: vi.fn(() => null),
    }
    vi.stubGlobal('localStorage', localStorageMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should initialize with initialValue and write encrypted state to localStorage', async () => {
    const key = 'test-secure-storage-new'
    const initialVal = { foo: 'bar' }
    const state = useSecureStorage(key, initialVal)

    expect(state.value).toEqual(initialVal)

    // Wait for asynchronous getMasterKey().then(...) initialization
    await delay(50)

    // Modify state to trigger watch and encryptAndSave
    state.value.foo = 'baz'
    await delay(50)

    // localStorage should contain an encrypted base64 string, not plaintext JSON
    const stored = storageState[key]
    expect(stored).toBeDefined()
    expect(stored).not.toContain('foo')
    expect(stored).not.toContain('baz')
  })

  it('should migrate plaintext JSON localStorage value and save encrypted version back', async () => {
    const key = 'test-secure-storage-migration'
    const plaintextJson = JSON.stringify({ oldKey: 'oldValue' })

    // Simulate old storage that was plaintext
    storageState[key] = plaintextJson

    const state = useSecureStorage(key, { oldKey: 'defaultValue' })

    // Wait for the asynchronous loader/migrator to finish
    await delay(50)

    // The state value should have been parsed from the plaintext JSON
    expect(state.value).toEqual({ oldKey: 'oldValue' })

    // It should have immediately encrypted and written back to localStorage
    const migratedStored = storageState[key]
    expect(migratedStored).toBeDefined()
    expect(migratedStored).not.toEqual(plaintextJson)
    expect(migratedStored).not.toContain('oldKey')
    expect(migratedStored).not.toContain('oldValue')
  })

  it('should decrypt an existing encrypted base64 payload from localStorage', async () => {
    const key = 'test-secure-storage-decrypt'
    const val = { hello: 'world' }

    // First, let's write an encrypted value using the store
    const stateWrite = useSecureStorage(key, val)
    await delay(50)

    stateWrite.value.hello = 'universe'
    await delay(50)

    const encryptedPayload = storageState[key]
    expect(encryptedPayload).toBeDefined()

    // Now, load it in a separate secure storage instance
    const stateRead = useSecureStorage(key, { hello: 'default' })
    await delay(50)

    expect(stateRead.value).toEqual({ hello: 'universe' })
  })
})
