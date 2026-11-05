import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useArtistryStore } from './artistry'

/**
 * @example
 * describe('artistry store', () => {})
 */
describe('artistry store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /**
   * @example
   * it('defaults to disabled artistry without treating ComfyUI as configured', () => {})
   */
  it('defaults to disabled artistry without treating ComfyUI as configured', () => {
    const artistryStore = useArtistryStore()

    // @example
    expect(artistryStore.globalProvider).toBe('none')
    // @example
    expect(artistryStore.activeProvider).toBe('none')
    // @example
    expect(artistryStore.configured).toBe(false)
  })

  // ROOT CAUSE:
  //
  // pinia-plugin-synced restores the whole store with structured clones. The
  // global and active provider options then have equal values but different
  // object identities. Watching the global object and assigning it to the
  // active object creates a second mutation after the synchronized patch.
  // That mutation broadcasts another full snapshot and repeats indefinitely.
  //
  // We fixed this by making global-to-active resolution an explicit store
  // operation and by preventing persistence from reflecting its own write.
  it('does not mutate active options after applying an equal synchronized snapshot', async () => {
    const artistryStore = useArtistryStore()
    artistryStore.globalProviderOptions = { steps: 20 }
    artistryStore.providerOptions = { steps: 20 }
    artistryStore.comfyuiSavedWorkflows = [{
      id: 'workflow-1',
      name: 'Workflow',
      workflow: {},
      exposedFields: {},
    }]
    await nextTick()

    let mutationCount = 0
    const stopSubscription = artistryStore.$subscribe(() => {
      mutationCount += 1
    }, { flush: 'sync' })

    artistryStore.$patch((currentState) => {
      Object.assign(currentState, {
        globalProviderOptions: { steps: 20 },
        providerOptions: { steps: 20 },
        comfyuiSavedWorkflows: [{
          id: 'workflow-1',
          name: 'Workflow',
          workflow: {},
          exposedFields: {},
        }],
      })
    })
    const mutationCountAfterSnapshot = mutationCount

    await nextTick()

    expect(mutationCount).toBe(mutationCountAfterSnapshot)
    stopSubscription()
  })
})

// ROOT CAUSE:
//
// A prior fix made replicateApiKey/nanobananaApiKey unconditionally memory-only
// (refManualReset) to stop a localStorage plaintext leak on Tamagotchi. But this store is
// shared by stage-web and stage-pocket too (apps/stage-web/src/App.vue:50,
// apps/stage-pocket/src/App.vue:45 both call useArtistryStore() directly), and neither has
// Tamagotchi's main-process secure-storage alternative. Going unconditionally memory-only
// silently broke credential persistence on every runtime except Tamagotchi.
//
// https://github.com/moeru-ai/airi/pull/2512#discussion_r4176290527
//
// We fixed this by branching on isStageTamagotchi(): web/Capacitor keep the original
// localStorage-backed refs; only Tamagotchi (which has the secure alternative) goes
// memory-only.
describe('artistry store API key persistence by runtime', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  async function loadArtistryStoreWithRuntimeMock(isTamagotchi: boolean) {
    const localStorageKeys: string[] = []

    vi.doMock('@proj-airi/stage-shared', async () => {
      const actual = await vi.importActual<typeof import('@proj-airi/stage-shared')>('@proj-airi/stage-shared')
      return { ...actual, isStageTamagotchi: () => isTamagotchi }
    })
    vi.doMock('@vueuse/core', async () => {
      const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
      // NOTICE: useLocalStorage's overloads are keyed to the literal initialValue type, which
      // doesn't resolve through a generic forwarding wrapper. The real implementation is still
      // called unchanged below; only its argument types are widened for this spy wrapper.
      const untypedUseLocalStorage = actual.useLocalStorage as unknown as (key: string, initialValue: unknown, options?: unknown) => unknown
      return {
        ...actual,
        useLocalStorage: (key: string, initialValue: unknown, options?: unknown) => {
          localStorageKeys.push(key)
          return untypedUseLocalStorage(key, initialValue, options)
        },
      }
    })

    const { createPinia: createDynamicPinia, setActivePinia: setDynamicActivePinia } = await import('pinia')
    setDynamicActivePinia(createDynamicPinia())
    const { useArtistryStore: useDynamicArtistryStore } = await import('./artistry')

    return { store: useDynamicArtistryStore(), localStorageKeys }
  }

  it('persists API keys through useLocalStorage on non-Tamagotchi runtimes', async () => {
    const { localStorageKeys } = await loadArtistryStoreWithRuntimeMock(false)

    expect(localStorageKeys).toContain('artistry-replicate-api-key')
    expect(localStorageKeys).toContain('artistry-nanobanana-api-key')
  })

  it('keeps API keys memory-only (never backed by useLocalStorage) on Tamagotchi', async () => {
    const { localStorageKeys } = await loadArtistryStoreWithRuntimeMock(true)

    expect(localStorageKeys).not.toContain('artistry-replicate-api-key')
    expect(localStorageKeys).not.toContain('artistry-nanobanana-api-key')
  })
})
