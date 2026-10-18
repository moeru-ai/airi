import type { GenerationProvider } from '@proj-airi/provider-inference'

import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { chatStickers } from '../assets/stickers'
import { useLLM } from './ai/chat-llm/llm'
import { useLlmToolsetPromptsStore } from './ai/chat-llm/toolset-prompts'
import { useChatStore } from './chat'
import { useChatSessionStore } from './chat/session-store'
import { useModsServerChannelStore } from './mods/api/channel-server'
import { useConsciousnessStore } from './modules/consciousness'
import { useStickersStore } from './modules/stickers'

const stores: ReturnType<typeof createPinia>[] = []

function setupChat() {
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

/**
 * Typed sends read the provider and model of the session character.
 * Call this before `setupChat`, because the card store reads storage when it starts.
 */
function storeDefaultCharacter(provider: string, model: string) {
  const modules = {
    consciousness: { provider, model },
    vision: { provider: '', model: '' },
    speech: { provider: '', model: '', voice_id: '' },
  }
  localStorage.setItem('airi-cards', JSON.stringify([['default', { name: 'Character', version: '1.0', extensions: { airi: { agents: {}, modules } } }]]))
  localStorage.setItem('airi-card-module-defaults', JSON.stringify(modules))
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const pinia of stores.splice(0)) {
    useModsServerChannelStore(pinia).dispose()
    useChatStore(pinia).dispose()
    disposePinia(pinia)
  }
  localStorage.removeItem('settings/stickers/enabled')
  localStorage.removeItem('settings/stickers/frequency')
  localStorage.removeItem('settings/consciousness/active-provider')
  localStorage.removeItem('settings/consciousness/active-model')
  localStorage.removeItem('airi-cards')
  localStorage.removeItem('airi-card-module-defaults')
})

it('captures the direct ingest session, provider, and supplement before waiting for the library', async () => {
  const pinia = setupChat()
  const chat = useChatStore(pinia)
  const sessions = useChatSessionStore(pinia)
  await sessions.initialize()
  const originalSession = sessions.activeSessionId
  const consciousness = useConsciousnessStore(pinia)
  consciousness.activeProvider = 'openai'
  const prompts = useLlmToolsetPromptsStore(pinia)
  prompts.registerToolsetPrompts('test', [{ id: 'original', content: 'Original supplement' }])
  const catalog = Promise.withResolvers<undefined>()
  vi.spyOn(useStickersStore(pinia), 'selectCatalogForReply').mockReturnValue(catalog.promise)
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/' } }),
  }
  const stream = vi.spyOn(useLLM(pinia), 'stream').mockImplementation(async (_model, _provider, _context, options) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: 'Original reply' })
    await options?.onStreamEvent?.({ type: 'finish' })
  })
  const pending = chat.ingest('Original request', { model: 'original-model', chatProvider: provider })
  const newSession = await sessions.createSession('test-character')
  try {
    consciousness.activeProvider = 'deepseek'
    prompts.registerToolsetPrompts('test', [{ id: 'changed', content: 'Changed supplement' }])
    catalog.resolve(undefined)
    await pending
    expect(stream).toHaveBeenCalledTimes(1)
    expect(stream.mock.calls[0][0]).toBe('original-model')
    expect(stream.mock.calls[0][1]).toBe(provider)
    expect(stream.mock.calls[0][3]?.providerId).toBe('openai')
    expect(JSON.stringify(stream.mock.calls[0][2])).toContain('Original supplement')
    expect(JSON.stringify(stream.mock.calls[0][2])).not.toContain('Changed supplement')
    expect(sessions.getSessionMessages(originalSession).some(message => message.role === 'assistant')).toBe(true)
    expect(sessions.getSessionMessages(newSession).some(message => message.role === 'assistant')).toBe(false)
  }
  finally {
    catalog.resolve(undefined)
    await pending.catch(() => {})
    await sessions.deleteSession(originalSession)
    await sessions.deleteSession(newSession)
  }
})

it.each(['cancel', 'cleanup', 'delete', 'direct-delete'] as const)('cancels direct ingest during library preparation on %s', async (operation) => {
  const pinia = setupChat()
  const chat = useChatStore(pinia)
  const sessions = useChatSessionStore(pinia)
  await sessions.initialize()
  const sessionId = sessions.activeSessionId
  const catalog = Promise.withResolvers<undefined>()
  vi.spyOn(useStickersStore(pinia), 'selectCatalogForReply').mockReturnValue(catalog.promise)
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/' } }),
  }
  const stream = vi.spyOn(useLLM(pinia), 'stream')
  const pending = chat.ingest('Cancelled request', { model: 'test-model', chatProvider: provider }, sessionId)
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  try {
    if (operation === 'cancel')
      await chat.cancelPendingSends(sessionId)
    else if (operation === 'cleanup')
      await chat.cleanup(sessionId)
    else if (operation === 'delete')
      await chat.deleteSession(sessionId)
    else
      await sessions.deleteSession(sessionId)
    catalog.resolve(undefined)
    await rejected
    expect(stream).not.toHaveBeenCalled()
    if (operation === 'delete' || operation === 'direct-delete')
      expect(sessions.getSessionMessagesIfLoaded(sessionId)).toBeUndefined()
  }
  finally {
    catalog.resolve(undefined)
    await pending.catch(() => {})
    await sessions.deleteSession(sessionId)
  }
})

// https://github.com/moeru-ai/airi/pull/2714#issuecomment-5976485328
// ROOT CAUSE:
// A catalog read after provider startup can apply newer settings to an older
// request. Preparing eligibility once keeps missed and selected requests stable.
it('preserves sticker eligibility across provider startup and resamples only for a new send (PR #2714)', async () => {
  storeDefaultCharacter('openai', 'test-model')
  const pinia = setupChat()
  const chat = useChatStore(pinia)
  const sessions = useChatSessionStore(pinia)
  await sessions.initialize()
  const sessionId = sessions.activeSessionId
  const consciousness = useConsciousnessStore(pinia)
  consciousness.activeProvider = 'openai'
  consciousness.activeModel = 'test-model'
  const stickers = useStickersStore(pinia)
  stickers.enabled = true
  stickers.frequency = 50
  const sample = vi.spyOn(stickers, 'selectCatalogForReply')
  vi.spyOn(Math, 'random').mockReturnValue(0.75)
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/' } }),
  }
  const startup = Promise.withResolvers<GenerationProvider>()
  const resolveProvider = vi.spyOn(consciousness, 'getChatProviderInstance').mockReturnValue(startup.promise)
  const stream = vi.spyOn(useLLM(pinia), 'stream').mockImplementation(async (_model, _provider, _context, options) => {
    await options?.onStreamEvent?.({ type: 'text-delta', text: `Hello <|STICKER ${chatStickers[0].id}|>` })
    await options?.onStreamEvent?.({ type: 'finish' })
  })
  const pending = chat.send({ sessionId, messageId: 'missed-sticker', text: 'Hello' })
  try {
    await expect.poll(() => resolveProvider.mock.calls.length).toBe(1)
    stickers.frequency = 100
    startup.resolve(provider)
    const missed = await pending
    expect(sample).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(stream.mock.calls[0][2])).not.toContain('STICKER')
    expect(missed.messages.find(message => message.role === 'assistant')?.slices).toEqual([{ type: 'text', text: 'Hello ' }])
    const selected = await chat.send({ sessionId, messageId: 'selected-sticker', text: 'Hello again' })
    expect(sample).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(stream.mock.calls[1][2])).toContain(`STICKER ${chatStickers[0].id}`)
    expect(selected.messages.find(message => message.role === 'assistant')?.slices).toContainEqual({ type: 'sticker', stickerId: chatStickers[0].id })
  }
  finally {
    startup.resolve(provider)
    await pending.catch(() => {})
    await sessions.deleteSession(sessionId)
  }
})

it('freezes names, emotion tags, and image versions for active and queued replies while the library is edited', async () => {
  storeDefaultCharacter('openai', 'test-model')
  const pinia = setupChat()
  const chat = useChatStore(pinia)
  const sessions = useChatSessionStore(pinia)
  await sessions.initialize()
  const sessionId = sessions.activeSessionId
  const consciousness = useConsciousnessStore(pinia)
  consciousness.activeProvider = 'openai'
  consciousness.activeModel = 'test-model'
  const stickers = useStickersStore(pinia)
  const blob = await (await fetch(chatStickers[0].src)).blob()
  const image = new File([blob], 'test.png', { type: 'image/png' })
  const entry = await stickers.add(image, 'Original thanks', ['thanks'])
  stickers.enabled = true
  stickers.frequency = 100
  const provider: GenerationProvider = {
    generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.com/' } }),
  }
  vi.spyOn(consciousness, 'getChatProviderInstance').mockResolvedValue(provider)
  const release = Promise.withResolvers<void>()
  let calls = 0
  const prompts: string[] = []
  vi.spyOn(useLLM(pinia), 'stream').mockImplementation(async (_model, _provider, context, options) => {
    prompts.push(JSON.stringify(context))
    if (++calls === 1)
      await release.promise
    await options?.onStreamEvent?.({ type: 'text-delta', text: `Thank you <|STICKER ${entry.assetId}|>` })
    await options?.onStreamEvent?.({ type: 'finish' })
  })
  const first = chat.send({ sessionId, messageId: 'active-library', text: 'Thanks' })
  let queued: ReturnType<typeof chat.send> | undefined
  try {
    await expect.poll(() => calls).toBe(1)
    queued = chat.send({ sessionId, messageId: 'queued-library', text: 'Thanks again' })
    await expect.poll(() => chat.pendingQueuedSendCount).toBe(1)
    await stickers.save(entry.id, 'Changed angry', ['angry'], image)
    await stickers.remove(entry.id)
    stickers.enabled = false
    stickers.frequency = 25
    release.resolve()
    const replies = await Promise.all([first, queued])
    for (const reply of replies) {
      expect(reply.messages.find(message => message.role === 'assistant')?.slices).toContainEqual({ type: 'sticker', stickerId: entry.assetId })
    }
    for (const prompt of prompts) {
      expect(prompt).toContain('Original thanks. Emotions: thanks.')
      expect(prompt).not.toContain('Changed angry')
    }
    expect(stickers.artwork[entry.assetId]).toBeTruthy()
    const fresh = await chat.send({ sessionId, text: 'Future reply' })
    expect(fresh.messages.find(message => message.role === 'assistant')?.slices).not.toContainEqual({ type: 'sticker', stickerId: entry.assetId })
    expect(prompts[2]).not.toContain('STICKER')
    const retried = await chat.retry({ sessionId, index: sessions.getSessionMessages(sessionId).length - 1 })
    expect(retried.messages.find(message => message.role === 'assistant')?.slices).not.toContainEqual({ type: 'sticker', stickerId: entry.assetId })
    await chat.ingest('Direct reply', { model: 'test-model', chatProvider: provider }, sessionId)
    expect(prompts[4]).not.toContain('STICKER')
  }
  finally {
    release.resolve()
    await Promise.allSettled([first, ...queued ? [queued] : []])
    await stickers.remove(entry.id)
    await sessions.deleteSession(sessionId)
  }
})
