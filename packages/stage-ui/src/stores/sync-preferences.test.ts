// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { syncCategories, useSyncPreferencesStore } from './sync-preferences'

describe('sync preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('turns every sync on by default', () => {
    const store = useSyncPreferencesStore()

    for (const category of syncCategories)
      expect(store.isEnabled(category)).toBe(true)
  })

  // Storage takes the change after the current tick.
  it('saves a switch on the device', async () => {
    useSyncPreferencesStore().setEnabled('providers', false)
    await nextTick()

    expect(JSON.parse(localStorage.getItem('settings/sync') ?? '{}')).toEqual({ providers: false })
  })

  it('keeps a sync off that the experiment turned off', () => {
    localStorage.setItem('settings/feature-flags', JSON.stringify({
      [JSON.stringify(['character-card-sync', null])]: false,
      [JSON.stringify(['display-model-sync', null])]: true,
      [JSON.stringify(['fullscreen-workspace', null])]: true,
    }))
    const store = useSyncPreferencesStore()

    expect(store.isEnabled('character-cards')).toBe(false)
    expect(store.isEnabled('display-models')).toBe(true)
    expect(store.isEnabled('chats')).toBe(true)
  })

  it('copies the experiment choices only once', async () => {
    localStorage.setItem('settings/feature-flags', JSON.stringify({ [JSON.stringify(['character-card-sync', null])]: false }))
    useSyncPreferencesStore().setEnabled('character-cards', true)
    await nextTick()

    setActivePinia(createPinia())

    expect(useSyncPreferencesStore().isEnabled('character-cards')).toBe(true)
  })

  it('takes the defaults when the experiment choices are unreadable', () => {
    localStorage.setItem('settings/feature-flags', '{')

    expect(useSyncPreferencesStore().isEnabled('character-cards')).toBe(true)
  })
})
