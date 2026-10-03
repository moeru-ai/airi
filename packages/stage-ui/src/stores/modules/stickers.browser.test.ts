import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { chatStickers } from '../../assets/stickers'
import { useStickersStore } from './stickers'

const stores: ReturnType<typeof createPinia>[] = []

function createStore() {
  const pinia = createPinia()
  stores.push(pinia)
  return useStickersStore(pinia)
}

beforeEach(() => localStorage.removeItem('settings/stickers/enabled'))
afterEach(() => {
  for (const pinia of stores.splice(0))
    disposePinia(pinia)
  localStorage.removeItem('settings/stickers/enabled')
})

it('requires opt-in and restores the preference when the store is recreated', async () => {
  const store = createStore()
  expect(store.enabled).toBe(false)
  expect(store.catalog).toBeUndefined()
  store.enabled = true
  await nextTick()
  expect(localStorage.getItem('settings/stickers/enabled')).toBe('true')
  const restored = createStore()
  expect(restored.catalog).toEqual(chatStickers)
  restored.resetState()
  await nextTick()
  expect(restored.catalog).toBeUndefined()
  expect(localStorage.getItem('settings/stickers/enabled')).toBe('false')
})

it('decodes every bundled image without an external image service', async () => {
  for (const sticker of chatStickers) {
    const image = new Image()
    image.src = sticker.src
    await image.decode()
    expect(image.naturalWidth).toBeGreaterThan(0)
    expect(new URL(image.src).origin).toBe(location.origin)
  }
})
