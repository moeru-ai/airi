import type { LeadershipMode, SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { createPinia, disposePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, ref } from 'vue'

import { getSpeechBusContext, speechIntentCancelEvent, speechIntentEndEvent, speechIntentLiteralEvent } from '../../../services/speech/bus'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useProviderConfigStore } from '../../providers/config'
import { useCharacterStore } from '../index'
import { useCharacterNotebookStore } from '../notebook'
import { useCharacterOrchestratorStore } from './store'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: ref('en'), t: (key: string) => key, te: () => false }),
}))

vi.mock('@proj-airi/server-sdk', async (importOriginal) => {
  const original = await importOriginal<typeof import('@proj-airi/server-sdk')>()
  return {
    ...original,
    Client: class {
      onEvent = vi.fn()
      offEvent = vi.fn()
      send = vi.fn()
      close = vi.fn()
    },
  }
})

const contexts: Array<{
  pinia: ReturnType<typeof createPinia>
  runtime: SyncedPiniaRuntime
  orchestrator: ReturnType<typeof useCharacterOrchestratorStore>
}> = []

function createContext(namespace: string, leadership: LeadershipMode) {
  const pinia = createPinia()
  const runtime = createSyncedPiniaPlugin({ namespace, leadership })
  pinia.use(runtime.plugin)
  createApp({}).use(pinia)
  const consciousness = useConsciousnessStore(pinia)
  consciousness.activeProvider = ''
  consciousness.activeModel = ''
  const orchestrator = useCharacterOrchestratorStore(pinia)
  orchestrator.attentionConfig.tickIntervalMs = 20
  const context = { pinia, runtime, orchestrator }
  contexts.push(context)
  return context
}

afterEach(() => {
  for (const context of contexts.splice(0)) {
    context.orchestrator.dispose()
    context.runtime.dispose()
    disposePinia(context.pinia)
  }
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('orchestrator tick ownership', () => {
  it('delivers current reaction tokens and closes only the matching cancelled speech intent', async () => {
    const context = createContext(`reaction-cancel:${crypto.randomUUID()}`, 'leader-only')
    const character = useCharacterStore(context.pinia)
    const literals: string[] = []
    const cancelled: string[] = []
    const ended: string[] = []
    const bus = getSpeechBusContext()
    const stops = [
      bus.on(speechIntentLiteralEvent, ({ body }) => { literals.push(body?.value ?? '') }),
      bus.on(speechIntentCancelEvent, ({ body }) => { cancelled.push(body?.intentId ?? '') }),
      bus.on(speechIntentEndEvent, ({ body }) => { ended.push(body?.intentId ?? '') }),
    ]
    try {
      character.onSparkNotifyReactionStreamEvent('current', 'A complete reaction with enough text for the parser. ')
      await vi.waitFor(() => expect(literals.join('')).toContain('A complete reaction'))
      character.cancelSparkNotifyReaction('current')
      await character.onSparkNotifyReactionStreamEnd('current', 'Cancelled text')
      expect(cancelled).toEqual(['spark:current'])
      expect(character.reactions).toEqual([])
      expect(ended).toEqual([])
      character.onSparkNotifyReactionStreamEvent('next', 'Next reaction.')
      await character.onSparkNotifyReactionStreamEnd('next', 'Next reaction.')
      await vi.waitFor(() => expect(ended).toEqual(['spark:next']))
      expect(literals.join('')).toContain('Next reaction.')
    }
    finally {
      for (const stop of stops)
        stop()
    }
  })

  it('aborts a model request and rejects late output when its owner stops', async () => {
    const release = Promise.withResolvers<Response>()
    let requestSignal: AbortSignal | null | undefined
    let requested = false
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes('/chat/completions')) {
        requestSignal = init?.signal
        requested = true
        return release.promise
      }
      return Response.json({ data: [] })
    }))
    const owner = createContext(`orchestrator-abort:${crypto.randomUUID()}`, 'leader-only')
    await vi.waitFor(() => expect(owner.runtime.isLeader()).toBe(true))
    const providerId = `notify-test-${crypto.randomUUID()}`
    useProviderConfigStore(owner.pinia).ensureProvider(providerId, 'openai', { apiKey: 'test', baseUrl: 'https://example.test/v1/', api: 'chat-completions' })
    const consciousness = useConsciousnessStore(owner.pinia)
    consciousness.activeProvider = providerId
    consciousness.activeModel = 'mock-model'
    owner.orchestrator.initialize(owner.runtime)
    const request = owner.orchestrator.handleSparkNotify({
      type: 'spark:notify',
      source: 'minecraft',
      data: { id: 'notify-cancelled', eventId: 'event-cancelled', kind: 'alarm', urgency: 'immediate', headline: 'Alarm', destinations: ['character'] },
    }).then(() => undefined, (error: unknown) => error)
    await vi.waitFor(() => expect(requested).toBe(true))
    owner.orchestrator.dispose()
    expect(requestSignal?.aborted).toBe(true)
    release.resolve(new Response([
      'data: {"id":"reply","object":"chat.completion.chunk","created":1,"model":"mock-model","choices":[{"index":0,"delta":{"content":"Stale reaction."},"finish_reason":null}]}',
      '',
      'data: {"id":"reply","object":"chat.completion.chunk","created":1,"model":"mock-model","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } }))
    expect(await request).toBeInstanceOf(Error)
    expect(useCharacterStore(owner.pinia).reactions).toEqual([])
    expect(owner.orchestrator.processing).toBe(false)
  })

  // ROOT CAUSE:
  // Each renderer started its own interval. Followers processed local reminder queues.
  // The installed election runtime now owns ticker and event-consumer lifecycle.
  it('ticks only in the elected leader and starts after promotion', async () => {
    const namespace = `orchestrator:${crypto.randomUUID()}`
    const leader = createContext(namespace, 'leader-only')
    await vi.waitFor(() => expect(leader.runtime.isLeader()).toBe(true))
    const follower = createContext(namespace, 'follower-preferred')
    await vi.waitFor(() => expect(follower.runtime.getLeaderId()).toBe(leader.runtime.participantId))
    const leaderNotebook = useCharacterNotebookStore(leader.pinia)
    const followerNotebook = useCharacterNotebookStore(follower.pinia)
    leaderNotebook.scheduleTask({ title: 'Leader reminder', dueAt: Date.now() })
    followerNotebook.scheduleTask({ title: 'Follower reminder', dueAt: Date.now() })

    leader.orchestrator.initialize(leader.runtime)
    follower.orchestrator.initialize(follower.runtime)
    follower.orchestrator.startTicker()
    await vi.waitFor(() => expect(leaderNotebook.tasks[0].lastNotifiedAt).toBeDefined())
    expect(followerNotebook.tasks[0].lastNotifiedAt).toBeUndefined()

    leader.orchestrator.dispose()
    leader.runtime.dispose()
    await vi.waitFor(() => expect(follower.runtime.isLeader()).toBe(true))
    await vi.waitFor(() => expect(followerNotebook.tasks[0].lastNotifiedAt).toBeDefined())
  })
})
