import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
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
