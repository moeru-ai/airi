import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

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
})
