import type { ChatAssistantMessage } from '../../../../types/chat'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import AssistantItem from './assistant-item.vue'

import { chatStickers } from '../../../../assets/stickers'
import { useStickersStore } from '../../../../stores/modules/stickers'

const stores: ReturnType<typeof createPinia>[] = []
afterEach(() => {
  for (const pinia of stores.splice(0))
    disposePinia(pinia)
})

function renderMessage(stickerId: string, pinia = createPinia()) {
  stores.push(pinia)
  const message: ChatAssistantMessage = {
    role: 'assistant',
    content: 'Hello!',
    tool_results: [],
    slices: [{ type: 'text', text: 'Hello!' }, { type: 'sticker', stickerId }],
  }
  return render(AssistantItem, {
    props: { label: 'AIRI', message: structuredClone(message) },
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('assistant stickers', () => {
  it('renders a text-only reply without requiring the sticker library or Pinia', async () => {
    setActivePinia(undefined)
    const view = render(AssistantItem, {
      props: { label: 'AIRI', message: { role: 'assistant', content: 'Text-only reply', slices: [], tool_results: [] } },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
    await expect.element(view.getByText('Text-only reply', { exact: true })).toBeVisible()
    expect(view.container.querySelector('img')).toBeNull()
  })

  it('renders a saved sticker as a local image beside the reply text', async () => {
    const view = renderMessage(chatStickers[0].id)
    await expect.element(view.getByRole('img', { name: chatStickers[0].description })).toBeVisible()
    await expect.poll(() => view.container.querySelector('img')?.naturalWidth).toBeGreaterThan(0)
    await expect.element(view.getByText('Hello!', { exact: true })).toBeVisible()
  })

  it('shows a placeholder for an unknown saved ID without requesting its URL', async () => {
    const view = renderMessage('https://example.com/untrusted.png')
    await expect.element(view.getByText('Sticker unavailable')).toBeVisible()
    expect(view.container.querySelector('img')).toBeNull()
  })
})

it('keeps original custom artwork visible after replacement, deletion, and a fresh renderer', async () => {
  const pinia = createPinia()
  const store = useStickersStore(pinia)
  const blob = await (await fetch(chatStickers[0].src)).blob()
  const file = new File([blob], 'test.png', { type: 'image/png' })
  const entry = await store.add(file, 'Saved custom image', ['happy'])
  const view = renderMessage(entry.assetId, pinia)
  await expect.element(view.getByRole('img', { name: 'Saved custom image' })).toBeVisible()
  const originalSrc = view.container.querySelector('img')!.src
  await store.save(entry.id, 'Replacement image', ['thanks'], file)
  await store.remove(entry.id)
  store.enabled = false
  await expect.poll(() => view.container.querySelector('img')?.src).toBe(originalSrc)
  await expect.poll(() => view.container.querySelector('img')?.naturalWidth).toBeGreaterThan(0)
  const restored = renderMessage(entry.assetId)
  await expect.element(restored.getByRole('img', { name: 'Saved sticker' })).toBeVisible()
  await expect.poll(() => restored.container.querySelector('img')?.naturalWidth).toBeGreaterThan(0)
})
