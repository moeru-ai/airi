import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

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
})
