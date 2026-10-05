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
    let decryptionThrows = false
    let isLinux = false
    let storageBackend: ReturnType<typeof import('electron').safeStorage.getSelectedStorageBackend> = 'gnome_libsecret'
    const writeFileMock = vi.fn(async (_path: string, data: string) => data)
    const renameMock = vi.fn(async () => {})
    const existsSyncMock = vi.fn(() => false)
    const readFileSyncMock = vi.fn(() => '')

    vi.doMock('std-env', () => ({
      get isLinux() { return isLinux },
    }))
    vi.doMock('electron', () => ({
      app: { getPath: vi.fn(() => '/tmp/airi-user-data') },
      safeStorage: {
        isEncryptionAvailable: () => encryptionAvailable,
        getSelectedStorageBackend: () => storageBackend,
        // NOTICE: a real OS keychain is unavailable in CI, so this stub round-trips through a
        // tagged string instead of real crypto — it only needs to prove the encrypt/decrypt
        // boundary is actually invoked, not exercise safeStorage's own encryption.
        encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf-8'),
        decryptString: (buffer: Buffer) => {
          if (decryptionThrows)
            throw new Error('Simulated decrypt failure (corrupted ciphertext, wrong machine/OS user, or rotated keychain key)')
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
      setDecryptionThrows: (value: boolean) => { decryptionThrows = value },
      setIsLinux: (value: boolean) => { isLinux = value },
      setStorageBackend: (value: typeof storageBackend) => { storageBackend = value },
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

  // ROOT CAUSE:
  //
  // isEncryptionAvailable() returning true does not mean an OS keychain actually protects the
  // ciphertext. On Linux, when no secret service (gnome-keyring/kwallet) is found, Electron
  // falls back to a 'basic_text' backend that encrypts with a hardcoded password baked into
  // the binary -- recoverable by anyone, no user secret needed. The prior code accepted that
  // backend and persisted "encrypted" credentials under it as if real protection succeeded.
  //
  // https://github.com/moeru-ai/airi/pull/2512#discussion_r4180458796
  // Source: https://www.electronjs.org/docs/latest/api/safe-storage#synchronous-api
  //
  // We fixed this by checking safeStorage.getSelectedStorageBackend() on Linux and rejecting
  // anything other than the known OS-keychain-backed backends.
  it('rejects the Linux basic_text backend exactly like encryption being unavailable', async () => {
    const { setIsLinux, setStorageBackend, writeFileMock, renameMock } = mockElectronEnvironment()
    setIsLinux(true)
    setStorageBackend('basic_text')
    const { createArtistryConfig } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()

    expect(() => config.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY }))).toThrow(/secure storage is unavailable/i)
    expect(writeFileMock).not.toHaveBeenCalled()
    expect(renameMock).not.toHaveBeenCalled()
  })

  it('rejects an unrecognized ("unknown") Linux backend the same way', async () => {
    const { setIsLinux, setStorageBackend } = mockElectronEnvironment()
    setIsLinux(true)
    setStorageBackend('unknown')
    const { createArtistryConfig } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()

    expect(() => config.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY }))).toThrow(/secure storage is unavailable/i)
  })

  it.each(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'] as const)('accepts the Linux %s backend', async (backend) => {
    const { setIsLinux, setStorageBackend } = mockElectronEnvironment()
    setIsLinux(true)
    setStorageBackend(backend)
    const { createArtistryConfig } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()

    expect(() => config.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY }))).not.toThrow()
  })

  it('does not check the storage backend at all on non-Linux platforms', async () => {
    const { setIsLinux, setStorageBackend } = mockElectronEnvironment()
    setIsLinux(false)
    setStorageBackend('basic_text') // would be rejected on Linux; irrelevant on macOS/Windows
    const { createArtistryConfig } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()

    expect(() => config.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY }))).not.toThrow()
  })

  // ROOT CAUSE:
  //
  // The decrypt catch block assumed any decryptString() failure meant the stored value was
  // legacy pre-encryption plaintext, and returned the raw bytes as-is. But when
  // isEncryptionAvailable() is true and decryptString() throws anyway (ciphertext restored on
  // a different machine/OS user, corruption, a rotated keychain key), those raw bytes are
  // actually base64 ciphertext, not a usable key. Handing them out let the renderer "hydrate"
  // successfully and re-sync them through encryptApiKey, double-encrypting and permanently
  // destroying the original value.
  //
  // https://github.com/moeru-ai/airi/pull/2512#discussion_r4180458798
  //
  // We fixed this by tagging our own ciphertext with ENCRYPTED_VALUE_PREFIX so a decrypt
  // failure on a tagged value is unambiguous: it's never legacy plaintext, so it's reported
  // as unavailable instead of being returned as a bogus "key".
  it('reports a decrypt exception as unavailable instead of returning the ciphertext as plaintext', async () => {
    const { setDecryptionThrows } = mockElectronEnvironment()
    const { createArtistryConfig, isApiKeyUnavailable } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()
    config.update(artistryPayload({ replicateApiKey: REAL_REPLICATE_KEY }))
    expect(config.get()?.artistryGlobals?.replicateApiKey).toBe(REAL_REPLICATE_KEY)

    // isEncryptionAvailable() stays true -- only decryptString() itself now fails.
    setDecryptionThrows(true)

    expect(config.get()?.artistryGlobals?.replicateApiKey).toBe('')
    const encryptedReplicateApiKey = config.getEncrypted()?.artistryGlobals?.replicateApiKey ?? ''
    expect(isApiKeyUnavailable(encryptedReplicateApiKey)).toBe(true)
  })

  it('treats a value without the encrypted-value marker as genuine legacy plaintext regardless of keychain state', async () => {
    const { existsSyncMock, readFileSyncMock, setEncryptionAvailable } = mockElectronEnvironment()
    // Simulate a config file written before this app version ever encrypted this field: no
    // ENCRYPTED_VALUE_PREFIX marker, just the raw plaintext key already on disk.
    existsSyncMock.mockReturnValue(true)
    readFileSyncMock.mockReturnValue(JSON.stringify(artistryPayload({ replicateApiKey: 'sk-pre-encryption-plaintext' })))
    const { createArtistryConfig, isApiKeyUnavailable } = await import('./artistry')

    const config = createArtistryConfig()
    config.setup()

    expect(config.get()?.artistryGlobals?.replicateApiKey).toBe('sk-pre-encryption-plaintext')
    expect(isApiKeyUnavailable(config.getEncrypted()?.artistryGlobals?.replicateApiKey ?? '')).toBe(false)

    // Even with the keychain unavailable, a value without the marker is never ciphertext, so
    // there's nothing to fail at -- it must still round-trip as plaintext, not "unavailable".
    setEncryptionAvailable(false)
    expect(config.get()?.artistryGlobals?.replicateApiKey).toBe('sk-pre-encryption-plaintext')
    expect(isApiKeyUnavailable(config.getEncrypted()?.artistryGlobals?.replicateApiKey ?? '')).toBe(false)
  })
})
