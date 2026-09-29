import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useChatSessionStore } from '../stores/chat/session-store'
import { useHearingDraftStore } from '../stores/hearing-drafts'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useConsciousnessStore } from '../stores/modules/consciousness'
import { useHearingStore } from '../stores/modules/hearing'
import { useProviderConfigStore } from '../stores/providers/config'
import { useHearingDelivery } from './use-hearing-delivery'

const contexts: ReturnType<typeof createPinia>[] = []
afterEach(() => {
  for (const pinia of contexts.splice(0))
    disposePinia(pinia)
  vi.restoreAllMocks()
  localStorage.clear()
})

async function mountDelivery(configured: boolean) {
  // Exercise real chat persistence. Only the remote model transport fails.
  const requests = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({
    error: { message: 'Model unavailable' },
  }), { status: 503, headers: { 'Content-Type': 'application/json' } }))
  const pinia = createPinia()
  contexts.push(pinia)
  let ready!: Promise<void>
  let sessions!: ReturnType<typeof useChatSessionStore>
  let drafts!: ReturnType<typeof useHearingDraftStore>
  let consciousness!: ReturnType<typeof useConsciousnessStore>
  let delivery!: ReturnType<typeof useHearingDelivery>
  render(defineComponent({
    setup() {
      ready = useAiriCardStore().initialize()
      sessions = useChatSessionStore()
      drafts = useHearingDraftStore()
      consciousness = useConsciousnessStore()
      const hearing = useHearingStore()
      hearing.autoSendEnabled = true
      hearing.autoSendDelay = 0
      useProviderConfigStore().ensureProvider('openai', 'openai', {
        apiKey: 'test',
        baseUrl: 'https://delivery.invalid/v1/',
      })
      delivery = useHearingDelivery()
      return () => h('div')
    },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  await ready
  consciousness.activeProvider = configured ? 'openai' : ''
  consciousness.activeModel = configured ? 'gpt-test' : ''
  const sessionId = await sessions.createSession('default')
  return { delivery, drafts, requests, sessionId, sessions }
}

// https://github.com/moeru-ai/airi/pull/2708
// ROOT CAUSE: Model failure followed user-turn persistence, but delivery restored text as another draft.
it('does not restore accepted speech after the model request fails (Issue #2708)', async () => {
  const { delivery, drafts, requests, sessionId, sessions } = await mountDelivery(true)
  await expect(delivery.deliver(sessionId, 'Recognized phrase', () => true)).rejects.toThrow()
  expect(requests).toHaveBeenCalled()
  expect(sessions.sessionMessages[sessionId]?.filter(message => message.role === 'user').map(message => message.content)).toEqual(['Recognized phrase'])
  expect(drafts.drafts[sessionId]).toBeUndefined()
})

it('restores unaccepted speech even when an older turn contains the same text', async () => {
  const { delivery, drafts, sessionId, sessions } = await mountDelivery(false)
  sessions.appendSessionMessage(sessionId, { role: 'user', id: 'earlier-turn', content: 'Repeated phrase' })
  await expect(delivery.deliver(sessionId, 'Repeated phrase', () => true)).rejects.toThrow('No chat provider or model')
  expect(sessions.sessionMessages[sessionId]?.filter(message => message.role === 'user')).toHaveLength(1)
  expect(drafts.drafts[sessionId]).toBe('Repeated phrase')
})
