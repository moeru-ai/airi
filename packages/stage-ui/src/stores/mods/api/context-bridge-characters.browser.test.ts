import type { ClientConnector, ClientEvents, WebSocketEventOf } from '@proj-airi/server-sdk'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { ContextUpdateStrategy, parseEvent } from '@proj-airi/server-sdk'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { storage } from '../../../database/storage'
import { useChatStore } from '../../chat'
import { useChatSessionStore } from '../../chat/session-store'
import { useContextObservabilityStore } from '../../devtools/context-observability'
import { useAiriCardStore } from '../../modules/airi-card'
import { useConsciousnessSettingsStore } from '../../modules/consciousness-settings'
import { useSpeechStore } from '../../modules/speech'
import { useProviderConfigStore } from '../../providers/config'
import { useProviderStore } from '../../providers/provider'
import { useModsServerChannelStore } from './channel-server'
import { useContextBridgeStore } from './context-bridge'
import { createContextChannel } from './context-channel'

const cleanups: Array<() => void | Promise<void>> = []

beforeEach(async () => {
  localStorage.clear()
  await storage.clear()
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse())
    await cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await storage.clear()
  localStorage.clear()
})

async function openRenderer() {
  const pinia = createPinia()
  const app = createApp({
    setup() {
      useSpeechStore()
      useContextBridgeStore()
      return () => null
    },
  })
  app.use(pinia).use(PiniaColada).use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
  app.mount(document.createElement('div'))
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
  })
  let transport: ClientEvents<string> | undefined
  const connector: ClientConnector<string> = {
    connect(events) {
      transport = events
      setTimeout(() => events.message(JSON.stringify({ type: 'module:authenticated', data: { authenticated: true } })), 0)
      return {
        send(text) {
          const event = parseEvent(text)
          if (event.type === 'extension:module:announce') {
            setTimeout(() => events.message(JSON.stringify({ type: 'extension:module:announced', data: event.data })), 0)
          }
          return true
        },
        close() {},
      }
    },
  }
  const channel = useModsServerChannelStore(pinia)
  await channel.initialize({ connector: () => connector })
  cleanups.push(() => channel.dispose())
  const cards = useAiriCardStore(pinia)
  await cards.initialize()
  const sessions = useChatSessionStore(pinia)
  await sessions.initialize()
  const bridge = useContextBridgeStore(pinia)
  await bridge.initialize()
  cleanups.push(() => bridge.dispose())
  return {
    pinia,
    cards,
    sessions,
    chat: useChatStore(pinia),
    receive(data: WebSocketEventOf<'input:text'>['data']) {
      if (!transport)
        throw new Error('Fixture transport is not connected')
      transport.message(JSON.stringify({ type: 'input:text', metadata: { source: { id: 'station-1', extension: { id: 'weather' } } }, data }))
    },
  }
}

// https://github.com/moeru-ai/airi/pull/2672#discussion_r4115859397
// ROOT CAUSE: The module bridge used the visible character's provider gate
// before it read the explicit target session.
it('sends module input to a configured character while the visible character is unconfigured', async () => {
  const completions: string[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).includes('/chat/completions')) {
      completions.push(String(init?.body))
      const chunk = { id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: 'Target reply' }, finish_reason: null }] }
      return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } })
    }
    return Response.json({ data: [], voices: [] })
  }))
  const renderer = await openRenderer()
  const visibleSession = renderer.sessions.activeSessionId
  await useProviderConfigStore(renderer.pinia).ensureProvider('openai-compatible', 'openai-compatible', { apiKey: 'fixture', baseUrl: 'https://model.invalid/v1/' })
  await useProviderStore(renderer.pinia).forceProviderConfigured('openai-compatible')
  const template = renderer.cards.activeCard!
  const target = await renderer.cards.addCard({
    ...template,
    name: 'Target',
    extensions: { ...template.extensions, airi: { ...template.extensions.airi, modules: { ...template.extensions.airi.modules, consciousness: { provider: 'openai-compatible', model: 'target-model' } } } },
  }, 'scratch')
  const targetSession = await renderer.sessions.createSession(target)
  await renderer.sessions.setActiveSession(visibleSession)
  expect(renderer.cards.resolveCharacter('default').modules.consciousness.provider).toBe('')
  renderer.receive({ text: 'Target input', overrides: { sessionId: targetSession } })
  await expect.poll(() => completions.length, { timeout: 5000 }).toBe(1)
  expect(JSON.parse(completions[0]).model).toBe('target-model')
  await expect.poll(() => renderer.chat.sending).toBe(false)
  expect(renderer.sessions.getSessionMessages(targetSession).some(message => message.role === 'user' && message.content === 'Target input')).toBe(true)
  expect(renderer.sessions.getSessionMessages(visibleSession).some(message => message.role === 'user')).toBe(false)
})

it('records accepted input context and sends sampling settings through the real chat runtime', async () => {
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).includes('/chat/completions')) {
      requests.push(String(init?.body))
      return new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
    }
    return Response.json({ data: [], voices: [] })
  }))
  const renderer = await openRenderer()
  await useProviderConfigStore(renderer.pinia).ensureProvider('openai-compatible', 'openai-compatible', { apiKey: 'fixture', baseUrl: 'https://model.invalid/v1/' })
  await useProviderStore(renderer.pinia).forceProviderConfigured('openai-compatible')
  await renderer.cards.updateActiveCardConsciousness({ provider: 'openai-compatible', model: 'target-model' })
  const settings = useConsciousnessSettingsStore(renderer.pinia)
  await settings.setTemperature(0.3)
  await settings.setTopP(0.8)
  await settings.setTemperatureEnabled(true)
  await settings.setTopPEnabled(true)
  renderer.receive({ text: 'hello', contextUpdates: [{ strategy: ContextUpdateStrategy.AppendSelf, text: 'input weather' }] })
  await expect.poll(() => requests.length).toBe(1)
  expect(JSON.parse(requests[0])).toMatchObject({ temperature: 0.3, top_p: 0.8 })
  expect(requests[0]).toContain('input weather')
  expect(useContextObservabilityStore(renderer.pinia).history).toContainEqual(expect.objectContaining({
    phase: 'store-ingested',
    channel: 'input',
    sourceKey: 'weather:station-1',
    mutation: 'append',
    details: expect.objectContaining({ entryCount: 1, inputType: 'input:text', update: expect.objectContaining({ text: 'input weather', contextId: expect.any(String), id: expect.any(String) }) }),
  }))
  await expect.poll(() => renderer.chat.sending).toBe(false)
})

it('continues text ingestion when the browser rejects a context clone', async () => {
  const requests: string[] = []
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).includes('/chat/completions')) {
      requests.push(String(init?.body))
      return new Response('data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
    }
    return Response.json({ data: [], voices: [] })
  }))
  const renderer = await openRenderer()
  await useProviderConfigStore(renderer.pinia).ensureProvider('openai-compatible', 'openai-compatible', { apiKey: 'fixture', baseUrl: 'https://model.invalid/v1/' })
  await useProviderStore(renderer.pinia).forceProviderConfigured('openai-compatible')
  await renderer.cards.updateActiveCardConsciousness({ provider: 'openai-compatible', model: 'target-model' })
  const clone = globalThis.structuredClone
  vi.spyOn(globalThis, 'structuredClone').mockImplementation((value, options) => {
    if (value && typeof value === 'object' && 'text' in value && value.text === 'bad input weather' && 'createdAt' in value && typeof value.createdAt === 'number')
      throw new DOMException('Cannot clone input context', 'DataCloneError')
    return clone(value, options)
  })
  renderer.receive({ text: 'hello', contextUpdates: [{ strategy: ContextUpdateStrategy.AppendSelf, text: 'bad input weather' }] })
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toContain('hello')
  expect(requests[0]).not.toContain('bad input weather')
  expect(useContextObservabilityStore(renderer.pinia).history).toContainEqual(expect.objectContaining({
    phase: 'store-ingest-rejected',
    channel: 'input',
    details: expect.objectContaining({ errorMessage: 'Cannot clone input context' }),
  }))
  await expect.poll(() => renderer.chat.sending).toBe(false)
})

// https://github.com/moeru-ai/airi/pull/2672#discussion_r4115859408
// ROOT CAUSE: Remote composition hooks reached speech even when token and
// terminal hooks were filtered because their conversation was inactive.
it('does not open the local composition lifecycle for an inactive remote conversation', async () => {
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({ data: [], voices: [] })))
  const renderer = await openRenderer()
  const remote = createContextChannel()
  cleanups.push(() => remote.dispose())
  const composed: string[] = []
  cleanups.push(renderer.chat.onBeforeMessageComposed(async (_message, context) => {
    composed.push(context.sessionId)
  }))
  const context = { sessionId: 'inactive-session', turnId: 'remote-turn', contexts: {}, message: { role: 'user' as const, content: 'Remote input' }, composedMessage: [] }
  await remote.emitStream({ type: 'before-compose', sessionId: context.sessionId, message: 'Remote input', context })
  const activeContext = { ...context, sessionId: renderer.sessions.activeSessionId, turnId: 'active-turn' }
  await remote.emitStream({ type: 'before-compose', sessionId: activeContext.sessionId, message: 'Active input', context: activeContext })
  await expect.poll(() => composed.includes(activeContext.sessionId)).toBe(true)
  expect(composed).toEqual([activeContext.sessionId])
})
