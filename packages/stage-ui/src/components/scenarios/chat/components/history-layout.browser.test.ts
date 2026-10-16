import type { ChatHistoryItem } from '../../../../types/chat'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ChatHistory from './history.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

// A user message reads voice message snapshots from a store.
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => disposePinia(pinia))

it.each(['desktop', 'mobile'] as const)('centers timestamps after five minutes of inactivity on %s', async (variant) => {
  const start = new Date('2026-10-06T10:00:00Z').getTime()
  const screen = await render(ChatHistory, {
    props: {
      variant,
      messages: [
        { id: 'first', role: 'user', content: 'First message', createdAt: start },
        { id: 'nearby', role: 'user', content: 'Nearby message', createdAt: start + 299_999 },
        { id: 'later', role: 'user', content: 'After a pause', createdAt: start + 599_999 },
        { id: 'undated', role: 'user', content: 'Undated message' },
        { id: 'invalid', role: 'user', content: 'Invalid timestamp', createdAt: Number.NaN },
      ],
      style: 'height: 600px; width: 360px;',
    },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  onTestFinished(() => screen.unmount())
  await vi.waitFor(() => {
    const timestamps = screen.container.querySelectorAll('time')
    expect(timestamps).toHaveLength(2)
    expect(timestamps[0].dateTime).toBe(new Date(start).toISOString())
    expect(timestamps[1].dateTime).toBe(new Date(start + 599_999).toISOString())
    expect(getComputedStyle(timestamps[1]).textAlign).toBe('center')
  })
})

it('keeps a bubble inside a narrow history when its folded reasoning holds a long URL', async () => {
  // ROOT CAUSE:
  //
  // A fit-content bubble never shrinks below its longest unbreakable token.
  // A long URL, even in folded reasoning, made it wider than the history,
  // which cut off every line.
  //
  // The bubble now stays within the history width.
  const url = 'https://example.com/a/very/long/path/that/does/not/break/anywhere/because/it/is/one/token'
  const messages: ChatHistoryItem[] = [{
    id: 'assistant-1',
    role: 'assistant',
    content: 'Hi',
    slices: [{ type: 'text', text: 'Hi' }],
    tool_results: [],
    categorization: { speech: 'Hi', reasoning: `Five days since ${url}` },
  }]
  const screen = await render(ChatHistory, {
    props: { messages, style: 'height: 600px; width: 300px;' },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  onTestFinished(() => screen.unmount())

  const history = screen.container.firstElementChild as HTMLElement
  await vi.waitFor(() => expect(screen.container.querySelector('.chat-message-item-container')).not.toBeNull())
  const bubble = screen.container.querySelector<HTMLElement>('.chat-message-item-container')!
  expect(bubble.getBoundingClientRect().right).toBeLessThanOrEqual(history.getBoundingClientRect().right)
})
