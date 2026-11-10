import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

import { filterExposed } from '../../libs/home-assistant/exposure'
import { useHomeAssistantStore } from './home-assistant'

const allowedKey = 'settings/home-assistant/allowed-entities'

describe('homeAssistantStore', () => {
  afterEach(() => localStorage.clear())

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241653854
  it('resets a stored list that is not a list of ids (PR #2903)', async () => {
    // ROOT CAUSE:
    //
    // The store read both lists from local storage unchecked. A stale build or a
    // hand edit can leave another type, which the grid and the tools both fail on.
    //
    // We now reset a list that does not parse.
    localStorage.setItem(allowedKey, JSON.stringify({ 'light.kitchen': true }))
    setActivePinia(createPinia())

    const settings = useHomeAssistantStore()

    expect(settings.allowedEntities).toEqual([])
    await expect.poll(() => localStorage.getItem(allowedKey)).toBe('[]')
  })

  // https://github.com/moeru-ai/airi/pull/2903#discussion_r4241893400
  it('resets a list that a storage event replaces with a value that is not a list of ids (PR #2903)', async () => {
    // ROOT CAUSE:
    //
    // The startup check read storage once. `useStorage` assigns a later storage
    // event straight to the ref, so another window can put a different type there
    // while the store is alive, and `filterExposed` builds a Set from the list.
    //
    // We validate both lists on every assignment now.
    setActivePinia(createPinia())
    const settings = useHomeAssistantStore()
    settings.exposureMode = 'allow'

    window.dispatchEvent(new StorageEvent('storage', {
      key: allowedKey,
      newValue: JSON.stringify({ 'light.kitchen': true }),
      storageArea: localStorage,
    }))

    await expect.poll(() => settings.allowedEntities).toEqual([])
    expect(() => filterExposed(settings.exposure, [{ entityId: 'light.kitchen' }])).not.toThrow()
    await expect.poll(() => localStorage.getItem(allowedKey)).toBe('[]')
  })
})
