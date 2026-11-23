import type { GenerationProvider } from '@proj-airi/provider-inference'

import en from '@proj-airi/i18n/locales/en'

import { CONVERSATION_TITLE_INSTRUCTIONS } from '@proj-airi/agents/conversation-title'
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
import { useConsciousnessSettingsStore } from './modules/consciousness-settings'
import { useProviderStore } from './providers/provider'

const stores: ReturnType<typeof createPinia>[] = []

const provider: GenerationProvider = {
  generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/' } }),
}

/** Starts the chat store with a default character that chats with `test-model`. */
async function setupChat() {
  const modules = {
    consciousness: { provider: 'openai', model: 'test-model' },
    vision: { provider: '', model: '' },
    speech: { provider: '', model: '', voice_id: '' },
  }
  // The card store reads storage when it starts.
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

  const sessions = useChatSessionStore(pinia)
  await sessions.initialize()
  const consciousness = useConsciousnessStore(pinia)
  consciousness.activeProvider = 'openai'
  consciousness.activeModel = 'test-model'
  vi.spyOn(consciousness, 'getChatProviderInstance').mockResolvedValue(provider)
  vi.spyOn(useProviderStore(pinia), 'getChatProviderInstance').mockResolvedValue(provider)

  return { chat: useChatStore(pinia), sessions, settings: useConsciousnessSettingsStore(pinia), llm: useLLM(pinia), sessionId: sessions.activeSessionId }
}

function isTitleRequest(conversation: unknown) {
  return JSON.stringify(conversation).includes(JSON.stringify(CONVERSATION_TITLE_INSTRUCTIONS).slice(1, -1))
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const pinia of stores.splice(0)) {
    useModsServerChannelStore(pinia).dispose()
    useChatStore(pinia).dispose()
    disposePinia(pinia)
  }
  localStorage.removeItem('settings/consciousness/active-provider')
  localStorage.removeItem('settings/consciousness/active-model')
  localStorage.removeItem('settings/consciousness/title-generation')
  localStorage.removeItem('airi-cards')
  localStorage.removeItem('airi-card-module-defaults')
})

it('names a new conversation with the chat model of its character after the first reply', async () => {
  const { chat, sessions, llm, sessionId } = await setupChat()
  const stream = vi.spyOn(llm, 'stream').mockImplementation(async (_model, _provider, conversation, options) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: isTitleRequest(conversation) ? '{"title": "Moon landing"}' : 'It was in 1969.' })
    await options?.onStreamEvent?.({ type: 'finish' })
  })

  try {
    await chat.send({ sessionId, messageId: 'first', text: 'When did people land on the moon?' })

    await expect.poll(() => sessions.sessionMetas[sessionId]?.title).toBe('Moon landing')
    const titleCall = stream.mock.calls.find(call => isTitleRequest(call[2]))
    expect(titleCall?.[0]).toBe('test-model')
    expect(titleCall?.[3]?.maxTokens).toBe(100)
    expect(titleCall?.[3]?.supportsTools).toBe(false)
    expect(JSON.stringify(titleCall?.[2])).toContain('When did people land on the moon?')
    expect(JSON.stringify(titleCall?.[2])).toContain('It was in 1969.')
  }
  finally {
    await sessions.deleteSession(sessionId)
  }
})

it('sends no title request when the setting is off', async () => {
  const { chat, sessions, settings, llm, sessionId } = await setupChat()
  await settings.setTitleGeneration(false)
  const stream = vi.spyOn(llm, 'stream').mockImplementation(async (_model, _provider, _conversation, options) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'Hello.' })
    await options?.onStreamEvent?.({ type: 'finish' })
  })

  try {
    await chat.send({ sessionId, messageId: 'first', text: 'Hello' })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(stream.mock.calls.some(call => isTitleRequest(call[2]))).toBe(false)
    expect(sessions.sessionMetas[sessionId]?.title).toBeUndefined()
  }
  finally {
    await sessions.deleteSession(sessionId)
  }
})

it('keeps a title that the owner sets while the title request runs', async () => {
  const { chat, sessions, llm, sessionId } = await setupChat()
  const titleReply = Promise.withResolvers<void>()
  const titleRequested = Promise.withResolvers<void>()
  vi.spyOn(llm, 'stream').mockImplementation(async (_model, _provider, conversation, options) => {
    if (isTitleRequest(conversation)) {
      titleRequested.resolve()
      await titleReply.promise
      await options?.onStreamEvent?.({ type: 'text-delta', text: '{"title": "Generated title"}' })
    }
    else {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'Hello.' })
    }
    await options?.onStreamEvent?.({ type: 'finish' })
  })

  try {
    await chat.send({ sessionId, messageId: 'first', text: 'Hello' })
    await titleRequested.promise
    await sessions.renameSession(sessionId, 'My title')
    titleReply.resolve()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(sessions.sessionMetas[sessionId]?.title).toBe('My title')
  }
  finally {
    titleReply.resolve()
    await sessions.deleteSession(sessionId)
  }
})

it('sends no second title request after a later reply when the first one failed', async () => {
  const { chat, sessions, llm, sessionId } = await setupChat()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const stream = vi.spyOn(llm, 'stream').mockImplementation(async (_model, _provider, conversation, options) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: isTitleRequest(conversation) ? 'Not JSON' : 'Hello.' })
    await options?.onStreamEvent?.({ type: 'finish' })
  })

  try {
    await chat.send({ sessionId, messageId: 'first', text: 'Hello' })
    await expect.poll(() => stream.mock.calls.filter(call => isTitleRequest(call[2])).length).toBe(1)
    await chat.send({ sessionId, messageId: 'second', text: 'Hello again' })
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(stream.mock.calls.filter(call => isTitleRequest(call[2]))).toHaveLength(1)
    expect(sessions.sessionMetas[sessionId]?.title).toBeUndefined()
  }
  finally {
    await sessions.deleteSession(sessionId)
  }
})
