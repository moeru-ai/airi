import type { GenerationProvider } from '@proj-airi/provider-inference'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useLLM } from './ai/chat-llm/llm'
import { useChatStore } from './chat'
import { useChatSessionStore } from './chat/session-store'
import { useModsServerChannelStore } from './mods/api/channel-server'
import { useConsciousnessStore } from './modules/consciousness'
import { useStickersStore } from './modules/stickers'
import { useSettingsGeneral } from './settings/general'

const stores: ReturnType<typeof createPinia>[] = []

function setupChat() {
  const modules = {
    consciousness: { provider: 'openai', model: 'test-model' },
    vision: { provider: '', model: '' },
    speech: { provider: '', model: '', voice_id: '' },
  }
  localStorage.setItem('airi-cards', JSON.stringify([['default', { name: 'Character', version: '1.0', extensions: { airi: { agents: {}, modules } } }]]))
  localStorage.setItem('airi-card-module-defaults', JSON.stringify(modules))
  const pinia = createPinia()
  stores.push(pinia)
  render(defineComponent({
    setup() {
      useChatStore()
      return () => h('div')
    },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  return pinia
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const pinia of stores.splice(0)) {
    useModsServerChannelStore(pinia).dispose()
    useChatStore(pinia).dispose()
    disposePinia(pinia)
  }
  for (const key of ['settings/translation-subtitle-enabled', 'settings/translation-language', 'airi-cards', 'airi-card-module-defaults'])
    localStorage.removeItem(key)
})

// https://github.com/moeru-ai/airi/pull/1518#discussion_r3024780536
// ROOT CAUSE:
// Live settings changed parser routing after the prompt requested translation.
// Each request now captures the target before preparation and keeps it through the queue.
it.each(['ingest', 'send'] as const)('keeps the subtitle setting through %s preparation and streaming (PR #1518)', async (method) => {
  const pinia = setupChat()
  const chat = useChatStore(pinia)
  const sessions = useChatSessionStore(pinia)
  await sessions.initialize()
  const sessionId = sessions.activeSessionId
  const settings = useSettingsGeneral(pinia)
  settings.translationSubtitleEnabled = true
  settings.translationLanguage = 'zh-Hans'
  const prepared = Promise.withResolvers<undefined>()
  vi.spyOn(useStickersStore(pinia), 'selectCatalogForReply').mockReturnValue(prepared.promise)
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/' } }),
  }
  vi.spyOn(useConsciousnessStore(pinia), 'getChatProviderInstance').mockResolvedValue(provider)
  const spoken: string[] = []
  const translated: string[] = []
  const removeLiteral = chat.onTokenLiteral(async (literal) => {
    spoken.push(literal)
  })
  const removeTranslation = chat.onTokenTranslation(async (literal) => {
    translated.push(literal)
  })
  const stream = vi.spyOn(useLLM(pinia), 'stream').mockImplementation(async (_model, _provider, _context, options) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'Hello<|TRANS:|>你好' })
    await options?.onStreamEvent?.({ type: 'finish' })
  })
  const pending = method === 'ingest'
    ? chat.ingest('Hello', { model: 'test-model', chatProvider: provider })
    : chat.send({ sessionId, text: 'Hello' })
  settings.translationSubtitleEnabled = false
  settings.translationLanguage = 'ja'
  try {
    prepared.resolve(undefined)
    await pending
    expect(JSON.stringify(stream.mock.calls[0][2])).toContain('zh-Hans')
    expect(spoken.join('')).toBe('Hello')
    expect(translated.join('')).toBe('你好')
    expect(sessions.getSessionMessages(sessionId).findLast(message => message.role === 'assistant')?.categorization?.speech).toBe('Hello')
  }
  finally {
    prepared.resolve(undefined)
    await pending.catch(() => {})
    removeLiteral()
    removeTranslation()
    await sessions.deleteSession(sessionId)
  }
})
