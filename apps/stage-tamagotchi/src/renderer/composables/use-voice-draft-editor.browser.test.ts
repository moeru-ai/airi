import en from '@proj-airi/i18n/locales/en'

import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useHearingDraftStore } from '@proj-airi/stage-ui/stores/hearing-drafts'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useVoiceDraftEditor } from './use-voice-draft-editor'

const contexts: ReturnType<typeof createPinia>[] = []
afterEach(() => {
  for (const pinia of contexts.splice(0))
    disposePinia(pinia)
  vi.restoreAllMocks()
  localStorage.clear()
})

async function mountEditor(configured: boolean) {
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
  let editor!: ReturnType<typeof useVoiceDraftEditor>
  render(defineComponent({
    setup() {
      ready = useAiriCardStore().initialize()
      sessions = useChatSessionStore()
      drafts = useHearingDraftStore()
      consciousness = useConsciousnessStore()
      useProviderConfigStore().ensureProvider('openai', 'openai', {
        apiKey: 'test',
        baseUrl: 'https://voice-draft.invalid/v1/',
      })
      editor = useVoiceDraftEditor()
      return () => h('div')
    },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  await ready
  consciousness.activeProvider = configured ? 'openai' : ''
  consciousness.activeModel = configured ? 'gpt-test' : ''
  const sessionId = await sessions.createSession('default')
  return { editor, drafts, requests, sessionId, sessions }
}

// https://github.com/moeru-ai/airi/pull/2708
// ROOT CAUSE: Model failure followed user-turn persistence, but delivery restored text as another draft.
it('does not restore accepted speech after the model request fails (Issue #2708)', async () => {
  const { editor, drafts, requests, sessionId, sessions } = await mountEditor(true)
  await drafts.append(sessionId, 'Recognized phrase')
  await editor.send()
  expect(editor.error.value).toBeTruthy()
  expect(requests).toHaveBeenCalled()
  expect(sessions.sessionMessages[sessionId]?.filter(message => message.role === 'user').map(message => message.content)).toEqual(['Recognized phrase'])
  expect(drafts.drafts[sessionId]).toBeUndefined()
})

it('restores unaccepted speech even when an older turn contains the same text', async () => {
  const { editor, drafts, sessionId, sessions } = await mountEditor(false)
  sessions.appendSessionMessage(sessionId, { role: 'user', id: 'earlier-turn', content: 'Repeated phrase' })
  await drafts.append(sessionId, 'Repeated phrase')
  await editor.send()
  expect(editor.error.value).toContain('chat provider or model')
  expect(sessions.sessionMessages[sessionId]?.filter(message => message.role === 'user')).toHaveLength(1)
  expect(drafts.drafts[sessionId]).toBe('Repeated phrase')
})
