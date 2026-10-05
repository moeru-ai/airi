import { Buffer } from 'node:buffer'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ROOT CAUSE:
//
// PR #2512 encrypted Replicate/Nanobanana API keys with Electron's safeStorage, but the
// original regression test only asserted against the valibot schema's *output shape* — it
// never exercised what actually gets written to disk, so a plaintext-persistence regression
// would not have failed it.
//
// https://github.com/moeru-ai/airi/pull/2512#discussion_r3978535976
// https://github.com/moeru-ai/airi/pull/2512#discussion_r3978535991
//
// These tests instead drive the public `createConfig`-backed `get`/`update` API end to end:
// they assert on the literal string handed to the mocked `writeFile` (i.e. what would land on
// disk), and on the fail-closed behavior when `safeStorage.isEncryptionAvailable()` is false.
describe('createArtistryConfig', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  function mockElectronEnvironment() {
    let encryptionAvailable = true
    const writeFileMock = vi.fn(async (_path: string, data: string) => data)
    const renameMock = vi.fn(async () => {})
    const existsSyncMock = vi.fn(() => false)
    const readFileSyncMock = vi.fn(() => '')

    vi.doMock('electron', () => ({
      app: { getPath: vi.fn(() => '/tmp/airi-user-data') },
      safeStorage: {
        isEncryptionAvailable: () => encryptionAvailable,
        // NOTICE: a real OS keychain is unavailable in CI, so this stub round-trips through a
        // tagged string instead of real crypto — it only needs to prove the encrypt/decrypt
        // boundary is actually invoked, not exercise safeStorage's own encryption.
        encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf-8'),
        decryptString: (buffer: Buffer) => {
          const text = buffer.toString('utf-8')
          if (!text.startsWith('encrypted:'))
            throw new Error('Ciphertext was not produced by the mocked safeStorage.encryptString')
          return text.slice('encrypted:'.length)
        },
      },
    }))
    vi.doMock('es-toolkit', () => ({
      // NOTICE: removes the 250ms throttle window so save() settles within the same tick,
      // matching the pattern already used by persistence.test.ts for this exact dependency.
      throttle: (handler: (...args: unknown[]) => unknown) => handler,
    }))
    vi.doMock('node:fs', () => ({
      existsSync: existsSyncMock,
      readFileSync: readFileSyncMock,
    }))
    vi.doMock('node:fs/promises', () => ({
      copyFile: vi.fn(async () => {}),
      mkdir: vi.fn(async () => {}),
      rename: renameMock,
      writeFile: writeFileMock,
    }))

    return {
      setEncryptionAvailable: (value: boolean) => { encryptionAvailable = value },
      writeFileMock,
      renameMock,
      existsSyncMock,
      readFileSyncMock,
    }
  }

  const REAL_REPLICATE_KEY = 'sk-replicate-live-aaaaaaaaaaaaaaaaaaaa'
  const REAL_NANOBANANA_KEY = 'nb_live_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

  function artistryPayload(overrides: { replicateApiKey?: string, nanobananaApiKey?: string }) {
    return {
      artistryProvider: 'replicate',
      artistryGlobals: {
        comfyuiServerUrl: 'http://localhost:8188',
        comfyuiSavedWorkflows: [],
        comfyuiActiveWorkflow: '',
        replicateApiKey: overrides.replicateApiKey ?? '',
        replicateDefaultModel: 'black-forest-labs/flux-schnell',
        replicateAspectRatio: '16:9',
        replicateInferenceSteps: 4,
        nanobananaApiKey: overrides.nanobananaApiKey ?? '',
        nanobananaModel: 'gemini-3.1-flash-image-preview',
        nanobananaResolution: '1K',
      },
    }
  }

  it('never writes plaintext API keys to the persisted config file', async () => {
    const { writeFileMock } = mockElectronEnvironment()
    const { createArtistryConfig } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()
    config.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY, nanobananaApiKey: REAL_NANOBANANA_KEY }))

    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalled()
    })

    const persistedJson = writeFileMock.mock.calls.at(-1)?.[1] as string
    expect(persistedJson).not.toContain(REAL_REPLICATE_KEY)
    expect(persistedJson).not.toContain(REAL_NANOBANANA_KEY)
  })

  it('round-trips a key through get() after update() via the encrypted in-memory value', async () => {
    const { writeFileMock } = mockElectronEnvironment()
    const { createArtistryConfig } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()
    config.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY, nanobananaApiKey: REAL_NANOBANANA_KEY }))

    expect(config.get()?.artistryGlobals?.replicateApiKey).toBe(REAL_REPLICATE_KEY)
    expect(config.get()?.artistryGlobals?.nanobananaApiKey).toBe(REAL_NANOBANANA_KEY)

    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalled()
    })
  })

  it('reads an encrypted key back correctly after reloading from disk', async () => {
    const { writeFileMock, existsSyncMock, readFileSyncMock } = mockElectronEnvironment()
    const { createArtistryConfig } = await import('./artistry')

    const writer = createArtistryConfig()
    writer.setup()
    writer.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY, nanobananaApiKey: REAL_NANOBANANA_KEY }))

    await vi.waitFor(() => {
      expect(writeFileMock).toHaveBeenCalled()
    })
    const persistedJson = writeFileMock.mock.calls.at(-1)?.[1] as string

    // Simulate an app restart: a fresh config instance reading back the bytes that were
    // actually written to disk (the encrypted ciphertext), not the writer's in-memory state.
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(persistedJson)
    const reloaded = createArtistryConfig()
    reloaded.setup()

    expect(reloaded.get()?.artistryGlobals?.replicateApiKey).toBe(REAL_REPLICATE_KEY)
    expect(reloaded.get()?.artistryGlobals?.nanobananaApiKey).toBe(REAL_NANOBANANA_KEY)
  })

  it('fails closed and never persists when safeStorage encryption is unavailable', async () => {
    const { setEncryptionAvailable, writeFileMock, renameMock } = mockElectronEnvironment()
    setEncryptionAvailable(false)
    const { createArtistryConfig } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()

    expect(() => config.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY }))).toThrow(/secure storage is unavailable/i)

    // No save was ever scheduled with the plaintext key — the throw happens before rawUpdate().
    expect(writeFileMock).not.toHaveBeenCalled()
    expect(renameMock).not.toHaveBeenCalled()
  })

  it('treats a previously-encrypted key as unset (not thrown, not ciphertext) once safeStorage becomes unavailable', async () => {
    const { setEncryptionAvailable } = mockElectronEnvironment()
    const { createArtistryConfig } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()
    config.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY }))
    expect(config.get()?.artistryGlobals?.replicateApiKey).toBe(REAL_REPLICATE_KEY)

    setEncryptionAvailable(false)

    expect(() => config.get()).not.toThrow()
    expect(config.get()?.artistryGlobals?.replicateApiKey).toBe('')
  })

  // ROOT CAUSE:
  //
  // get() alone can't tell a genuinely empty key apart from one whose ciphertext exists but
  // currently can't be decrypted -- both read back as ''. A caller that round-trips get()'s
  // output back through update() (as the renderer's hydrate-then-push flow does) can't tell
  // it just captured a placeholder, and would persist that '' over the real ciphertext,
  // destroying it even after the keychain becomes available again.
  //
  // https://github.com/moeru-ai/airi/pull/2512#discussion_r4179494678
  //
  // We fixed this by exposing getEncrypted() (the raw, pre-decryption stored value) alongside
  // isApiKeyUnavailable(), so a caller that needs to make this distinction (the
  // artistryGetConfig bridge handler) can, without having to change what get() itself returns
  // for every other caller.
  it('exposes the real ciphertext via getEncrypted() even when get() reports the key as unset', async () => {
    const { setEncryptionAvailable } = mockElectronEnvironment()
    const { createArtistryConfig, isApiKeyUnavailable } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()
    config.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY }))

    setEncryptionAvailable(false)

    expect(config.get()?.artistryGlobals?.replicateApiKey).toBe('')
    const encryptedReplicateApiKey = config.getEncrypted()?.artistryGlobals?.replicateApiKey ?? ''
    expect(encryptedReplicateApiKey).not.toBe('')
    expect(encryptedReplicateApiKey).not.toBe(REAL_REPLICATE_KEY)
    expect(isApiKeyUnavailable(encryptedReplicateApiKey)).toBe(true)

    // An actually-empty key (never set) must not be flagged as "unavailable" just because
    // the keychain happens to be down -- there's no ciphertext at risk of being destroyed.
    const encryptedNanobananaApiKey = config.getEncrypted()?.artistryGlobals?.nanobananaApiKey ?? ''
    expect(isApiKeyUnavailable(encryptedNanobananaApiKey)).toBe(false)
  })
})
