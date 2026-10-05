import type { ArtistryConfig } from '../../../configs/artistry'

import { Buffer } from 'node:buffer'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ENCRYPTED_VALUE_PREFIX } from '../../../configs/artistry'

function fakeArtistryConfig(overrides: Partial<ArtistryConfig> = {}): ArtistryConfig {
  return {
    setup: vi.fn(),
    get: vi.fn(() => undefined),
    update: vi.fn(),
    getDiagnostics: vi.fn(() => undefined),
    flush: vi.fn(async () => {}),
    writeDurable: vi.fn(async () => {}),
    getEncrypted: vi.fn(() => undefined),
    ...overrides,
  }
}

describe('resolveArtistryGetConfigResult', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  // ROOT CAUSE:
  //
  // get() alone can't tell "the key was never set" apart from "ciphertext exists but the
  // keychain can't decrypt it right now" -- both read back as ''. The artistryGetConfig IPC
  // response needs to make that distinction so the renderer doesn't re-sync the empty
  // placeholder and permanently erase the real ciphertext (artistry-credentials.ts's
  // hydration gate relies on this).
  //
  // https://github.com/moeru-ai/airi/pull/2512#discussion_r4179494678
  it('flags a key as unavailable when its ciphertext exists but the keychain cannot decrypt it', async () => {
    vi.doMock('electron', () => ({
      safeStorage: { isEncryptionAvailable: () => false },
    }))
    const { resolveArtistryGetConfigResult } = await import('./artistry-bridge')

    const config = fakeArtistryConfig({
      get: vi.fn(() => ({
        artistryProvider: 'replicate',
        // decryptApiKey already degraded this to '' because the keychain is down.
        artistryGlobals: { replicateApiKey: '', nanobananaApiKey: '' } as any,
      })),
      getEncrypted: vi.fn(() => ({
        artistryProvider: 'replicate',
        // ...but the raw stored value still holds real ciphertext (marked with the prefix
        // encryptApiKey tags its output with, so decryptApiKey recognizes it as ciphertext
        // rather than legacy plaintext).
        artistryGlobals: { replicateApiKey: `${ENCRYPTED_VALUE_PREFIX}sk-still-there`, nanobananaApiKey: '' } as any,
      })),
    })

    const result = resolveArtistryGetConfigResult(config)

    expect(result.globals.replicateApiKey).toBe('')
    expect(result.replicateApiKeyUnavailable).toBe(true)
    // Never set in the first place -- no ciphertext at risk, so not "unavailable".
    expect(result.nanobananaApiKeyUnavailable).toBe(false)
  })

  it('does not flag a key as unavailable when the keychain can decrypt it normally', async () => {
    vi.doMock('electron', () => ({
      safeStorage: {
        isEncryptionAvailable: () => true,
        // NOTICE: a real OS keychain is unavailable in CI, so this stub round-trips through a
        // tagged string instead of real crypto -- it only needs to prove the decrypt path is
        // actually invoked and succeeds, not exercise safeStorage's own encryption.
        decryptString: (buffer: Buffer) => {
          const text = buffer.toString('utf-8')
          if (!text.startsWith('encrypted:'))
            throw new Error('Ciphertext was not produced by the mocked safeStorage.encryptString')
          return text.slice('encrypted:'.length)
        },
      },
    }))
    const { resolveArtistryGetConfigResult } = await import('./artistry-bridge')

    const config = fakeArtistryConfig({
      get: vi.fn(() => ({
        artistryProvider: 'replicate',
        artistryGlobals: { replicateApiKey: 'sk-decrypted', nanobananaApiKey: '' } as any,
      })),
      getEncrypted: vi.fn(() => ({
        artistryProvider: 'replicate',
        artistryGlobals: { replicateApiKey: `${ENCRYPTED_VALUE_PREFIX}${Buffer.from('encrypted:sk-decrypted', 'utf-8').toString('base64')}`, nanobananaApiKey: '' } as any,
      })),
    })

    const result = resolveArtistryGetConfigResult(config)

    expect(result.globals.replicateApiKey).toBe('sk-decrypted')
    expect(result.replicateApiKeyUnavailable).toBe(false)
    expect(result.nanobananaApiKeyUnavailable).toBe(false)
  })
})

describe('persistArtistryApiKeys', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  // ROOT CAUSE:
  //
  // The handler called artistryConfig.update(), whose return type is void: update() sets the
  // in-memory map and schedules a throttled, error-swallowing save() without awaiting it. The
  // invoke resolved before the write (or its failure) actually happened, so the renderer's
  // migration flow could clear the only plaintext copy of a credential before the encrypted
  // copy was durably on disk.
  //
  // https://github.com/moeru-ai/airi/pull/2512#discussion_r4179494683
  //
  // We fixed this by awaiting writeDurable() (an immediate, non-throttled write that surfaces
  // real failures) before resolving. flush() isn't suitable here: it's a separate primitive
  // (added for shutdown-ordering) that awaits already-scheduled writes but never rejects.
  it('awaits a durable write before resolving', async () => {
    vi.doMock('electron', () => ({
      safeStorage: { isEncryptionAvailable: () => true },
    }))
    const { persistArtistryApiKeys } = await import('./artistry-bridge')

    let resolveWrite: (() => void) | undefined
    const writeDurable = vi.fn(() => new Promise<void>((resolve) => {
      resolveWrite = resolve
    }))
    const config = fakeArtistryConfig({ writeDurable })

    let resolved = false
    const persistPromise = persistArtistryApiKeys(config, { replicateApiKey: 'sk-migrated' }).then(() => {
      resolved = true
    })

    await vi.waitFor(() => {
      expect(writeDurable).toHaveBeenCalled()
    })
    expect(resolved).toBe(false)

    resolveWrite?.()
    await persistPromise

    expect(resolved).toBe(true)
  })

  it('propagates a writeDurable rejection instead of resolving successfully', async () => {
    vi.doMock('electron', () => ({
      safeStorage: { isEncryptionAvailable: () => true },
    }))
    const { persistArtistryApiKeys } = await import('./artistry-bridge')

    const writeError = new Error('disk full')
    const config = fakeArtistryConfig({
      writeDurable: vi.fn(async () => {
        throw writeError
      }),
    })

    await expect(persistArtistryApiKeys(config, { replicateApiKey: 'sk-migrated' })).rejects.toThrow(writeError)
  })

  it('merges only the provided keys into the existing globals, leaving the rest untouched', async () => {
    vi.doMock('electron', () => ({
      safeStorage: { isEncryptionAvailable: () => true },
    }))
    const { persistArtistryApiKeys } = await import('./artistry-bridge')

    const update = vi.fn()
    const config = fakeArtistryConfig({
      get: vi.fn(() => ({
        artistryProvider: 'replicate',
        artistryGlobals: {
          comfyuiServerUrl: 'http://localhost:8188',
          comfyuiSavedWorkflows: [],
          comfyuiActiveWorkflow: '',
          replicateApiKey: 'sk-old',
          replicateDefaultModel: 'black-forest-labs/flux-schnell',
          replicateAspectRatio: '16:9',
          replicateInferenceSteps: 4,
          nanobananaApiKey: 'nb-old',
          nanobananaModel: 'gemini-3.1-flash-image-preview',
          nanobananaResolution: '1K',
        },
      })),
      update,
    })

    await persistArtistryApiKeys(config, { replicateApiKey: 'sk-migrated' })

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      artistryGlobals: expect.objectContaining({
        replicateApiKey: 'sk-migrated',
        nanobananaApiKey: 'nb-old',
        comfyuiServerUrl: 'http://localhost:8188',
      }),
    }))
  })
})
