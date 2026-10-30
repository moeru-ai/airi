import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const invokeMocks = vi.hoisted(() => ({
  getConfig: vi.fn(async () => ({ provider: 'none', globals: { replicateApiKey: '', nanobananaApiKey: '' } })),
  syncConfig: vi.fn(async (config: unknown) => config),
  setApiKeys: vi.fn(async (payload: unknown) => payload),
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaInvoke: (event: { receiveEvent?: { id?: string } }) => {
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:artistry:get-config-receive')
      return invokeMocks.getConfig
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:artistry:sync-config-receive')
      return invokeMocks.syncConfig
    if (event?.receiveEvent?.id === 'eventa:invoke:electron:artistry:set-api-keys-receive')
      return invokeMocks.setApiKeys

    throw new Error(`Unexpected eventa invoke: ${JSON.stringify(event)}`)
  },
}))

// This store only exists for the Tamagotchi runtime, so it must observe the real safeStorage
// branch of the shared artistry store (isStageTamagotchi() === true) rather than the
// web/Capacitor localStorage branch.
vi.mock('@proj-airi/stage-shared', async () => {
  const actual = await vi.importActual<typeof import('@proj-airi/stage-shared')>('@proj-airi/stage-shared')
  return { ...actual, isStageTamagotchi: () => true }
})

// Shared, mutable `.value` holders standing in for the two legacy localStorage keys. Hoisted
// (so they predate module imports -- plain objects, not Vue refs, since vi.hoisted runs before
// `vue` is bound) so test bodies can pre-set a "value already in localStorage" before the store
// under test reads it, mirroring server-channel.test.ts's useLocalStorage mocking pattern. The
// production code only ever does plain `.value` get/set on these, with no reactivity tracking,
// so a non-reactive holder is a faithful stand-in here.
const legacyStorageRefs = vi.hoisted(() => ({
  replicate: { value: '' },
  nanobanana: { value: '' },
}))

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return {
    ...actual,
    useLocalStorage: (key: string, initialValue: unknown) => {
      if (key === 'artistry-replicate-api-key')
        return legacyStorageRefs.replicate
      if (key === 'artistry-nanobanana-api-key')
        return legacyStorageRefs.nanobanana

      return (actual.useLocalStorage as unknown as (key: string, initialValue: unknown) => unknown)(key, initialValue)
    },
  }
})

const toastError = vi.fn()
vi.mock('vue-sonner', () => ({
  toast: {
    error: toastError,
  },
}))

describe('useArtistryCredentialsStore', async () => {
  const { useArtistryCredentialsStore } = await import('./artistry-credentials')
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    legacyStorageRefs.replicate.value = ''
    legacyStorageRefs.nanobanana.value = ''
    invokeMocks.getConfig.mockClear()
    invokeMocks.syncConfig.mockClear()
    invokeMocks.setApiKeys.mockClear()
    invokeMocks.getConfig.mockImplementation(async () => ({ provider: 'none', globals: { replicateApiKey: '', nanobananaApiKey: '' } }))
    invokeMocks.syncConfig.mockImplementation(async config => config)
    invokeMocks.setApiKeys.mockImplementation(async payload => payload)
    toastError.mockClear()
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.restoreAllMocks()
  })

  // ROOT CAUSE:
  //
  // A prior fix switched the renderer's API key refs to memory-only, but never cleaned up the
  // plaintext `artistry-replicate-api-key` / `artistry-nanobanana-api-key` entries a pre-upgrade
  // install already wrote to localStorage. The plaintext stayed recoverable after upgrading.
  //
  // https://github.com/moeru-ai/airi/pull/2512#discussion_r4176290522
  //
  // We fixed this by migrating a legacy value into main's encrypted store (confirmed via a
  // resolved setArtistryApiKeys call) before clearing the legacy localStorage entry.
  it('migrates a legacy plaintext key into main and clears the legacy entry', async () => {
    legacyStorageRefs.replicate.value = 'sk-legacy-plaintext'

    useArtistryCredentialsStore()

    await vi.waitFor(() => {
      expect(invokeMocks.setApiKeys).toHaveBeenCalledWith({ replicateApiKey: 'sk-legacy-plaintext', nanobananaApiKey: '' })
    })
    await vi.waitFor(() => {
      expect(legacyStorageRefs.replicate.value).toBe('')
    })
    expect(useArtistryStore().replicateApiKey).toBe('sk-legacy-plaintext')
  })

  it('does not clear the legacy key when migrating it fails', async () => {
    legacyStorageRefs.replicate.value = 'sk-legacy-plaintext'
    invokeMocks.setApiKeys.mockRejectedValueOnce(new Error('secure storage unavailable'))

    const store = useArtistryCredentialsStore()

    await vi.waitFor(() => {
      expect(invokeMocks.setApiKeys).toHaveBeenCalled()
    })
    await nextTick()

    expect(legacyStorageRefs.replicate.value).toBe('sk-legacy-plaintext')
    expect(store.credentialsHydrated).toBe(false)
  })

  // ROOT CAUSE:
  //
  // hydrateArtistryApiKeys() in App.vue swallowed its own rejection internally, so the
  // `.finally()` that registered the push watcher always ran -- even when hydration had
  // failed and the refs were still empty. The immediate watcher then pushed empty credentials
  // to main, overwriting the saved encrypted keys.
  //
  // https://github.com/moeru-ai/airi/pull/2512#discussion_r4176290523
  //
  // We fixed this by gating the push on credentialsHydrated, which only flips to true once
  // hydration actually succeeds -- a failed read leaves it false and no push ever reaches main.
  it('never pushes empty credentials to main after a failed hydration', async () => {
    invokeMocks.getConfig.mockRejectedValueOnce(new Error('ipc unavailable'))

    const store = useArtistryCredentialsStore()

    await vi.waitFor(() => {
      expect(invokeMocks.getConfig).toHaveBeenCalled()
    })
    await nextTick()
    expect(store.credentialsHydrated).toBe(false)

    useArtistryStore().activeProvider = 'replicate'
    await nextTick()

    expect(invokeMocks.syncConfig).not.toHaveBeenCalled()
  })

  // ROOT CAUSE:
  //
  // decryptApiKey degrades an undecryptable (keychain unavailable) stored key to '' rather
  // than throwing, so getConfig's response can't be told apart from "really empty" by its
  // globals alone. hydrateAndMigrateCredentials used to accept that '' as a successful
  // hydration, flip credentialsHydrated to true, and let the immediate push watcher re-sync
  // the empty value through artistrySyncConfig -- permanently erasing the real ciphertext,
  // since encryptApiKey('') never checks the keychain before persisting an empty string.
  //
  // https://github.com/moeru-ai/airi/pull/2512#discussion_r4179494678
  //
  // We fixed this by having main's getConfig response flag *Unavailable fields, and treating
  // either flag exactly like a failed hydration here -- credentialsHydrated stays false, so
  // the push watcher never fires and the ciphertext is left untouched until a later restart
  // finds the keychain available again.
  it('never re-syncs an unavailable credential as an empty value', async () => {
    invokeMocks.getConfig.mockImplementation(async () => ({
      provider: 'none',
      globals: { replicateApiKey: '', nanobananaApiKey: '' },
      replicateApiKeyUnavailable: true,
    }))

    const store = useArtistryCredentialsStore()

    await vi.waitFor(() => {
      expect(invokeMocks.getConfig).toHaveBeenCalled()
    })
    await nextTick()
    expect(store.credentialsHydrated).toBe(false)

    useArtistryStore().activeProvider = 'replicate'
    await nextTick()

    expect(invokeMocks.syncConfig).not.toHaveBeenCalled()
    expect(invokeMocks.setApiKeys).not.toHaveBeenCalled()
  })

  it('treats main as authoritative over a stale legacy key and still clears it', async () => {
    legacyStorageRefs.replicate.value = 'stale-legacy-value'
    invokeMocks.getConfig.mockImplementation(async () => ({ provider: 'none', globals: { replicateApiKey: 'main-encrypted-value', nanobananaApiKey: '' } }))

    useArtistryCredentialsStore()

    await vi.waitFor(() => {
      expect(useArtistryStore().replicateApiKey).toBe('main-encrypted-value')
    })
    expect(invokeMocks.setApiKeys).not.toHaveBeenCalled()
    expect(legacyStorageRefs.replicate.value).toBe('')
  })
})
