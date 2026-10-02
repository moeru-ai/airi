import type { Conversation } from '@proj-airi/core-agent'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'
/* eslint-disable style/indent-binary-ops */
/* eslint-disable style/operator-linebreak */
import type { Pinia, Store, StoreDefinition } from 'pinia'
import type { Mock } from 'vitest'
import type { UnwrapRef } from 'vue'
import type z from 'zod'

import type { StreamEvent } from '../../ai/chat-llm/llm'
import type { AiriCard } from '../../modules'

import { OWNER_AUDIENCE, renderConversationPreview } from '@proj-airi/core-agent'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { tool } from '@xsai/tool'
import { nanoid } from 'nanoid'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { MAX_PROPOSAL_DEPTH, sparkNotifyCommandSchema, useCharacterOrchestratorStore } from '.'
import { useCharacterStore } from '..'
import { useLLM } from '../../ai/chat-llm/llm'
import { useChatContextStore } from '../../chat/context-store'
import { useChatSessionStore } from '../../chat/session-store'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useModuleDirectoryStore } from '../../mods/api/module-directory'
import { useAiriCardStore, useConsciousnessStore } from '../../modules'
import { useProviderStore } from '../../providers/provider'
import { useSchedulerStore } from '../../scheduler'
import { useSettingsRunLimits } from '../../settings/run-limits'
import { useSettingsTriage } from '../../settings/triage'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: ref('en'),
    t: (key: string) => key,
    te: () => true,
  }),
}))

function mockedStore<TStoreDef extends (pinia?: Pinia) => unknown>(
  useStore: TStoreDef,
  pinia?: Pinia,
): TStoreDef extends StoreDefinition<
  infer Id,
  infer State,
  infer Getters,
  infer Actions
>
  ? Store<
    Id,
    State,
    Record<string, never>,
    {
      [K in keyof Actions]: Actions[K] extends (...args: any[]) => any
        ? // 👇 depends on your testing framework
        Mock<Actions[K]>
        : Actions[K]
    }
  > & {
    [K in keyof Getters]: UnwrapRef<Getters[K]>
  }
  : ReturnType<TStoreDef> {
  return useStore(pinia) as any
}

function getObjectSchema(schema?: Record<string, any>) {
  if (!schema)
    return undefined

  if (schema.type === 'object')
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
  return candidates.find((candidate: Record<string, any>) => candidate?.type === 'object')
}

function getArraySchema(schema?: Record<string, any>) {
  if (!schema)
    return undefined

  if (schema.type === 'array')
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
  return candidates.find((candidate: Record<string, any>) => candidate?.type === 'array')
}

describe('sparkNotifyCommandSchema', () => {
  it('emits strict objects in the json schema', async () => {
    const sparkTool = await tool({
      name: 'builtIn_sparkCommand',
      description: 'test',
      parameters: sparkNotifyCommandSchema,
      execute: async () => undefined,
    })

    const schema = sparkTool.function.parameters as Record<string, any>
    const commandsSchema = getArraySchema(schema.properties?.commands)
    const commandItemSchema = getObjectSchema(commandsSchema?.items)
    const guidanceSchema = getObjectSchema(commandItemSchema?.properties?.guidance)
    const personaSchema = getArraySchema(guidanceSchema?.properties?.persona)
    const personaItemSchema = getObjectSchema(personaSchema?.items)
    const optionsSchema = getArraySchema(guidanceSchema?.properties?.options)
    const optionsItemSchema = getObjectSchema(optionsSchema?.items)

    expect(schema.additionalProperties).toBe(false)
    expect(commandItemSchema?.additionalProperties).toBe(false)
    expect(guidanceSchema?.additionalProperties).toBe(false)
    expect(personaItemSchema?.additionalProperties).toBe(false)
    expect(optionsItemSchema?.additionalProperties).toBe(false)
  })
})

describe('store character-orchestrator', () => {
  const sendSparkCommandMock = vi.fn()
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)

    sendSparkCommandMock.mockReset()
    mockedStore(useModsServerChannelStore, pinia).send = sendSparkCommandMock

    const mockGetChatProviderInstance = vi.fn()
    mockedStore(useProviderStore, pinia).getChatProviderInstance = mockGetChatProviderInstance
    mockedStore(useProviderStore, pinia).getChatProviderInstance.mockResolvedValue({ generation: (model: string) => ({ protocol: 'chat-completions', config: { model, apiKey: 'test', baseURL: 'https://example.com/v1/' } }) })

    const consciousnessStore = useConsciousnessStore(pinia)
    consciousnessStore.activeProvider = 'mock-provider'
    consciousnessStore.activeModel = 'mock-model'

    const airiCardStore = useAiriCardStore(pinia)
    // @ts-expect-error - testing purpose
    airiCardStore.systemPrompt = 'You are a brave adventurer in Minecraft.'
    // @ts-expect-error - testing purpose
    airiCardStore.activeCard = {
      name: 'Hero',
      version: '1.0',
      extensions: {
        airi: {
          agents: {},
          modules: {
            consciousness: {
              provider: 'mock-provider',
              model: 'mock-model',
            },
            vision: {
              provider: 'mock-vision-provider',
              model: 'mock-vision-model',
            },
            speech: {
              provider: 'mock-speech-provider',
              model: 'mock-speech-model',
              voice_id: 'alloy',
            },
          },
        },
      },
    } satisfies AiriCard
  })

  it('handles immediate spark:notify with reaction and commands', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM, pinia).stream = mockStream
    mockedStore(useLLM, pinia).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      if (options?.tools?.length) {
        await options.tools[1].execute({ commands: [{
          destinations: ['minecraft'],
          intent: 'action',
          priority: 'critical',
          interrupt: 'false',
          ack: 'ok',
          guidance: null,
        }] } satisfies z.infer<typeof sparkNotifyCommandSchema>)
      }

      await options?.onStreamEvent?.({ type: 'text-delta', text: 'Ahhh, got hit by zombie!' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const mockOnSparkNotifyReactionStreamEvent = vi.fn()
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEvent = mockOnSparkNotifyReactionStreamEvent
    const mockOnSparkNotifyReactionStreamEnd = vi.fn()
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEnd = mockOnSparkNotifyReactionStreamEnd

    const store = useCharacterOrchestratorStore(pinia)
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'minecraft',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'alarm',
        urgency: 'immediate',
        headline: 'Hit by zombie',
        destinations: ['character'],
      },
    }

    const result = await store.handleSparkNotify(event)

    expect(result?.commands).toHaveLength(1)
    expect(result?.commands?.[0].destinations).toEqual([event.source])
    expect(result?.commands?.[0].parentEventId).toBe(event.data.id)
    expect(result?.commands?.[0].intent).toBe('action')
    expect(result?.commands?.[0].priority).toBe('critical')

    expect(mockStream).toHaveBeenCalledTimes(1)
    expect(mockStream.mock.calls).toHaveLength(1)
    expect(mockStream.mock.calls[0][0]).toEqual('mock-model')
    expect(mockStream.mock.calls[0][1]).not.toBeNull()
    expect((mockStream.mock.calls[0][2] as Conversation).turns).toHaveLength(2)
    expect(mockStream.mock.calls[0][3]).toHaveProperty('tools')

    expect(mockOnSparkNotifyReactionStreamEvent).toHaveBeenCalledWith(event.data.id, 'Ahhh, got hit by zombie!', { interrupt: true })
    expect(mockOnSparkNotifyReactionStreamEnd).toHaveBeenCalledTimes(1)
  })

  it('supports forcing text-only spark:notify responses', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM, pinia).stream = mockStream
    mockedStore(useLLM, pinia).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'I choose d5 to pressure the center.' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const onDelta = vi.fn()
    const onEnd = vi.fn()
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEvent = onDelta
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEnd = onEnd

    const store = useCharacterOrchestratorStore(pinia)
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'plugin:airi-plugin-game-chess',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'ping',
        urgency: 'immediate',
        headline: 'AIRI played d5',
        destinations: ['character'],
      },
    }

    await store.handleSparkNotifyWithReaction(event, {
      forceTextResponse: true,
    })

    const streamOptions = mockStream.mock.lastCall?.[3]
    expect(streamOptions).toMatchObject({
      supportsTools: false,
      tools: [],
      waitForTools: false,
    })
    expect(streamOptions?.toolChoice).toBeUndefined()
    expect(onDelta).toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalled()
  })

  it('supports forcing spark-command responses', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM, pinia).stream = mockStream
    mockedStore(useLLM, pinia).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      const sparkCommandTool = options?.tools?.find((tool: any) => tool.function?.name === 'builtIn_sparkCommand')
      await sparkCommandTool.execute({
        commands: [{
          destinations: ['minecraft'],
          intent: 'action',
          priority: 'high',
          interrupt: 'false',
          ack: 'go',
          guidance: null,
        }],
      } satisfies z.infer<typeof sparkNotifyCommandSchema>)
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'This should be ignored.' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const onDelta = vi.fn()
    const onEnd = vi.fn()
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEvent = onDelta
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEnd = onEnd

    useModuleDirectoryStore(pinia).modules = [{ name: 'minecraft', connectionId: 'minecraft-connection', cognition: { accepts: ['action'], control: { exclusive: true } } }]
    const store = useCharacterOrchestratorStore(pinia)
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'minecraft',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'alarm',
        urgency: 'immediate',
        headline: 'Take cover',
        destinations: ['character'],
      },
    }

    const result = await store.handleSparkNotify(event, {
      forceSparkCommandResponse: true,
    })

    const streamOptions = mockStream.mock.lastCall?.[3]
    expect(streamOptions).toMatchObject({
      supportsTools: true,
      toolChoice: {
        type: 'function',
        function: { name: 'builtIn_sparkCommand' },
      },
      waitForTools: true,
    })
    expect(result?.commands?.length).toBe(1)
    // Admission stamps the session that holds control of the module.
    expect(sendSparkCommandMock).toHaveBeenCalledWith({
      type: 'spark:command',
      data: { ...result?.commands[0], holder: useChatSessionStore(pinia).activeSessionId },
    })
    expect(useSchedulerStore(pinia).leases.holder('module:minecraft')?.holder).toBe(useChatSessionStore(pinia).activeSessionId)
    expect(onDelta).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledWith(event.data.id, '')
  })

  // ROOT CAUSE:
  // Notification commands went straight to the channel. Any destination that the model named received work.
  it('never sends a notification command to an undeclared module', async () => {
    mockedStore(useLLM, pinia).stream = vi.fn<ReturnType<typeof useLLM>['stream']>(async (_model, _provider, _messages, options) => {
      const tools = typeof options?.tools === 'function' ? await options.tools() : options?.tools
      const sparkCommandTool = tools?.find(tool => tool.function.name === 'builtIn_sparkCommand')
      await sparkCommandTool?.execute({
        commands: [{ destinations: ['vscode'], intent: 'action', priority: 'high', interrupt: 'false', ack: 'go', guidance: null }],
      } satisfies z.infer<typeof sparkNotifyCommandSchema>, { messages: [], toolCallId: 'command' })
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = useCharacterOrchestratorStore(pinia)

    const result = await store.handleSparkNotify({
      type: 'spark:notify',
      source: 'minecraft',
      data: { id: nanoid(), eventId: nanoid(), kind: 'alarm', urgency: 'immediate', headline: 'Open editor', destinations: ['character'] },
    }, { forceSparkCommandResponse: true })

    expect(result?.commands).toHaveLength(1)
    expect(sendSparkCommandMock).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('Spark notify command rejected:', expect.stringContaining('unknown-destination (vscode)'))
    warn.mockRestore()
  })

  // https://github.com/moeru-ai/airi/pull/2464#discussion_r3933609456
  it('preserves runtime rules when a Spark caller replaces the user payload', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM, pinia).stream = mockStream
    mockedStore(useLLM, pinia).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      await options?.onStreamEvent?.({ type: 'text-delta', text: 'legacy-safe text' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const store = useCharacterOrchestratorStore(pinia)
    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'plugin:airi-plugin-game-chess',
      data: {
        id: nanoid(),
        eventId: nanoid(),
        kind: 'ping',
        urgency: 'immediate',
        headline: 'Legacy rendering',
        destinations: ['character'],
      },
    }

    await store.handleSparkNotify(event, {
      forceTextResponse: true,
      messageOverride: {
        appendSystemInstructions: ['Plugin-specific hint'],
        appendUserSections: ['Rendered board snapshot'],
        replaceUserMessage: 'Replacement user payload',
      },
    })

    const context = mockStream.mock.lastCall?.[2] as Conversation | undefined
    const renderedMessages = context ? renderConversationPreview(context).map(message => message.content) : undefined
    expect(String(renderedMessages?.[0])).toContain('Plugin-specific hint')
    expect(String(renderedMessages?.[1])).toContain('Replacement user payload')
    expect(String(renderedMessages?.[1])).toContain('Rendered board snapshot')
    expect(String(renderedMessages?.[1])).toContain('base.prompt.emotion')
    expect(String(renderedMessages?.[1])).toContain('base.prompt.emoji')
  })

  describe('notification intake', () => {
    const notify = (data: Partial<WebSocketEventOf<'spark:notify'>['data']> = {}): WebSocketEventOf<'spark:notify'> => ({
      type: 'spark:notify',
      source: 'minecraft',
      data: { id: nanoid(), eventId: nanoid(), kind: 'alarm', urgency: 'immediate', headline: 'Creeper', destinations: ['character'], ...data },
    })

    function replyWith(text: string) {
      const mockStream = vi.fn<ReturnType<typeof useLLM>['stream']>(async (_model, _provider, _messages, options) => {
        await options?.onStreamEvent?.({ type: 'text-delta', text } satisfies StreamEvent)
        await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
      })
      mockedStore(useLLM, pinia).stream = mockStream
      return mockStream
    }

    // ROOT CAUSE:
    // A notification reaction opened an interrupting speech intent, so it spoke over the conversation run.
    it('defers an immediate notification while equally urgent speech holds the voice', async () => {
      const mockStream = replyWith('Watch out!')
      const scheduler = useSchedulerStore(pinia)
      scheduler.leases.acquire('voice', 'conversation-run', { salience: 0.9 })
      const store = useCharacterOrchestratorStore(pinia)
      const event = notify()

      await store.handleSparkNotify(event)

      expect(mockStream).not.toHaveBeenCalled()
      expect(store.scheduledNotifies.map(item => item.event.data.id)).toEqual([event.data.id])
      expect(scheduler.intake.forStimulus(event.data.id)).toMatchObject([{ outcome: 'deferred', reason: 'resource-busy', salience: 0.9 }])
      expect(scheduler.runs.snapshot()).toEqual([])
      expect(scheduler.leases.holder('voice')?.holder).toBe('conversation-run')
    })

    // Candidates for one resource compare by salience tier, deadline, and waiting time, never by who asks first after a release.
    it('puts an urgent waiting notification ahead of a later chat send in the voice line', async () => {
      replyWith('Watch out!')
      const scheduler = useSchedulerStore(pinia)
      scheduler.leases.acquire('voice', 'conversation-run', { salience: 0.9 })
      const store = useCharacterOrchestratorStore(pinia)
      const event = notify()

      await store.handleSparkNotify(event)
      scheduler.leases.release('voice', 'conversation-run')
      const [waiting] = store.scheduledNotifies

      expect(scheduler.leases.acquire('voice', 'next-chat-send', { salience: 0.5 })).toEqual({ granted: false, ahead: waiting?.runId })
    })

    it('ignores an expired notification before asking a classifier', async () => {
      const settings = useSettingsTriage(pinia)
      settings.backend = 'decisions'
      settings.decisionsApiKey = 'key'
      const fetch = vi.fn(async () => Response.json({ answers: {} }))
      vi.stubGlobal('fetch', fetch)
      const store = useCharacterOrchestratorStore(pinia)
      const event = notify({ ttlMs: 0 })

      await store.handleSparkNotify(event)

      expect(fetch).not.toHaveBeenCalled()
      expect(useSchedulerStore(pinia).intake.forStimulus(event.data.id)).toMatchObject([{ outcome: 'ignored', reason: 'expired', decidedBy: 'rule' }])
      vi.unstubAllGlobals()
    })

    // T20: a notification run counts against the shared run capacity, so a limit of one serializes all active work.
    it('defers a notification while the shared run capacity is full', async () => {
      const mockStream = replyWith('unused')
      useSettingsRunLimits(pinia).maxConcurrentRuns = 1
      const scheduler = useSchedulerStore(pinia)
      scheduler.runs.admit({ runId: 'domain-run', envelope: { sessionId: 'discord', bindings: [], outputs: ['chat:owner'], audience: OWNER_AUDIENCE } })
      scheduler.runs.transition('domain-run', 'working')
      const store = useCharacterOrchestratorStore(pinia)
      const event = notify()

      await store.handleSparkNotify(event)

      expect(mockStream).not.toHaveBeenCalled()
      expect(scheduler.intake.forStimulus(event.data.id)).toMatchObject([{ outcome: 'deferred', reason: 'resource-busy' }])
    })

    it('defers a notification during an error burst instead of failing again', async () => {
      const mockStream = replyWith('unused')
      const scheduler = useSchedulerStore(pinia)
      for (const runId of ['a', 'b', 'c']) {
        scheduler.runs.admit({ runId, envelope: { sessionId: 'session', bindings: [], outputs: ['chat:owner'], audience: OWNER_AUDIENCE } })
        scheduler.runs.transition(runId, 'blocked', 'provider down')
      }
      const store = useCharacterOrchestratorStore(pinia)
      const event = notify()

      await store.handleSparkNotify(event)

      expect(mockStream).not.toHaveBeenCalled()
      expect(scheduler.intake.forStimulus(event.data.id)).toMatchObject([{ outcome: 'deferred', reason: 'error-cooldown', retryAt: scheduler.errorBurst.coolingUntil() }])
    })

    // Urgent work interrupts lower-salience speech at a sentence boundary. Other notifications wait for it.
    it('takes the voice from calmer speech and interrupts it at a boundary', async () => {
      replyWith('Creeper behind you!')
      const reactions: Array<{ interrupt?: boolean }> = []
      mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEvent = vi.fn<ReturnType<typeof useCharacterStore>['onSparkNotifyReactionStreamEvent']>((_eventId, _text, options) => {
        reactions.push({ interrupt: options?.interrupt })
      })
      const scheduler = useSchedulerStore(pinia)
      scheduler.leases.acquire('voice', 'conversation-run', { salience: 0.5 })
      const store = useCharacterOrchestratorStore(pinia)

      await store.handleSparkNotify(notify())
      await store.handleSparkNotify(notify({ urgency: 'soon' }))

      expect(scheduler.runs.snapshot()).toMatchObject([{ state: 'done' }])
      expect(reactions).toEqual([{ interrupt: true }])
      // The calmer notification waits in line instead of cutting in.
      expect(store.scheduledNotifies).toHaveLength(1)
    })

    it('runs an admitted notification as a run that holds and releases the voice', async () => {
      replyWith('Watch out!')
      const scheduler = useSchedulerStore(pinia)
      const voiceHolders: Array<string | undefined> = []
      scheduler.leases.subscribe(() => voiceHolders.push(scheduler.leases.holder('voice')?.holder))
      const store = useCharacterOrchestratorStore(pinia)
      const event = notify()

      await store.handleSparkNotify(event)

      const [run] = scheduler.runs.snapshot()
      expect(run).toMatchObject({ state: 'done', envelope: { outputs: ['voice'] } })
      expect(scheduler.intake.forStimulus(event.data.id)).toMatchObject([{ outcome: 'admitted', runId: run.runId, origin: 'external', source: 'minecraft' }])
      expect(voiceHolders).toEqual([run.runId, undefined])
    })

    it('records a missing model as a blocked run, never as silence', async () => {
      useConsciousnessStore(pinia).activeModel = ''
      const store = useCharacterOrchestratorStore(pinia)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await store.handleSparkNotify(notify())

      expect(useSchedulerStore(pinia).runs.snapshot()).toMatchObject([{ state: 'blocked', error: 'No active provider or model' }])
      warn.mockRestore()
    })

    it('replaces a waiting notification with a newer one that has the same coalescing key', async () => {
      const store = useCharacterOrchestratorStore(pinia)
      const scheduler = useSchedulerStore(pinia)
      const older = notify({ urgency: 'later', coalesceKey: 'health' })
      const newer = notify({ urgency: 'later', coalesceKey: 'health' })
      const unrelated = notify({ urgency: 'later' })

      await store.handleSparkNotify(older)
      await store.handleSparkNotify(unrelated)
      await store.handleSparkNotify(newer)

      expect(store.scheduledNotifies.map(item => item.event.data.id)).toEqual([unrelated.data.id, newer.data.id])
      expect(store.pendingNotifies.map(item => item.data.id)).toEqual([unrelated.data.id, newer.data.id])
      expect(scheduler.intake.forStimulus(older.data.id)).toMatchObject([
        { outcome: 'deferred', retryAt: expect.any(Number) },
        { outcome: 'merged', mergedInto: newer.data.id },
      ])
    })

    it('ignores a notification that a confident classifier skips, without a run', async () => {
      const mockStream = replyWith('Should not speak')
      const settings = useSettingsTriage(pinia)
      settings.backend = 'decisions'
      settings.decisionsApiKey = 'key'
      vi.stubGlobal('fetch', vi.fn(async () => Response.json({ answers: { attend: { type: 'noul', noul: 0.01 } } })))
      const store = useCharacterOrchestratorStore(pinia)
      const event = notify({ urgency: 'later', headline: 'A cow mooed' })

      await store.handleSparkNotify(event)

      expect(mockStream).not.toHaveBeenCalled()
      expect(store.scheduledNotifies).toEqual([])
      expect(useSchedulerStore(pinia).intake.forStimulus(event.data.id)).toMatchObject([{ outcome: 'ignored', reason: 'not-attending', decidedBy: 'classifier', appraisal: { backend: 'decisions' } }])
      expect(useSchedulerStore(pinia).runs.snapshot()).toEqual([])
      vi.unstubAllGlobals()
    })

    function observe(text: string) {
      mockedStore(useChatContextStore, pinia).getContextsSnapshot = vi.fn<ReturnType<typeof useChatContextStore>['getContextsSnapshot']>(() => ({ minecraft: [{ id: 'status', contextId: 'status', strategy: ContextUpdateStrategy.ReplaceSelf, text, createdAt: 0 }] }))
    }

    function decideWith(noul: number) {
      const settings = useSettingsTriage(pinia)
      settings.backend = 'decisions'
      settings.decisionsApiKey = 'key'
      const fetch = vi.fn(async () => Response.json({ answers: { attend: { type: 'noul', noul } } }))
      vi.stubGlobal('fetch', fetch)
      return fetch
    }

    // T9: with no external input, an idle appraisal proposes work, and the run can output through its own channel.
    it('turns a confident idle appraisal into an internal proposal that runs', async () => {
      const mockStream = replyWith('By the way, the creeper is gone.')
      decideWith(0.97)
      observe('Creeper left the base')
      const store = useCharacterOrchestratorStore(pinia)
      const scheduler = useSchedulerStore(pinia)

      await store.appraiseIdle()

      expect(mockStream).toHaveBeenCalledOnce()
      const records = scheduler.intake.snapshot()
      expect(records.map(record => [record.event, record.outcome, record.origin])).toEqual([
        ['appraisal', 'admitted', 'internal'],
        ['proposal', 'admitted', 'internal'],
      ])
      expect(scheduler.runs.snapshot()).toMatchObject([{ runId: records[1]?.runId, state: 'done', envelope: { outputs: ['voice'] } }])
      vi.unstubAllGlobals()
    })

    // T10: an idle appraisal can discard its own proposal, with no run and no provider call.
    it('records an idle appraisal that finds nothing to raise, without a run', async () => {
      const mockStream = replyWith('unused')
      const fetch = decideWith(0.03)
      observe('Nothing changed')
      const store = useCharacterOrchestratorStore(pinia)

      await store.appraiseIdle()
      // The same observations are not appraised again.
      await store.appraiseIdle(Date.now() + 60 * 60_000)

      expect(fetch).toHaveBeenCalledOnce()
      expect(mockStream).not.toHaveBeenCalled()
      expect(useSchedulerStore(pinia).intake.snapshot()).toMatchObject([{ event: 'appraisal', outcome: 'ignored', reason: 'not-attending', decidedBy: 'classifier' }])
      expect(useSchedulerStore(pinia).runs.snapshot()).toEqual([])
      vi.unstubAllGlobals()
    })

    it('does not appraise without a classifier', async () => {
      observe('Creeper left the base')
      const store = useCharacterOrchestratorStore(pinia)

      await store.appraiseIdle()

      expect(useSchedulerStore(pinia).intake.snapshot()).toEqual([])
    })

    // T12: a proposal chain stops at its depth limit.
    it('rejects a proposal beyond the chain depth limit', async () => {
      const mockStream = replyWith('unused')
      const store = useCharacterOrchestratorStore(pinia)

      await store.propose({ headline: 'Follow up again', depth: MAX_PROPOSAL_DEPTH + 1, parentRunId: 'parent-run' })

      expect(mockStream).not.toHaveBeenCalled()
      expect(useSchedulerStore(pinia).intake.snapshot()).toMatchObject([{ event: 'proposal', outcome: 'rejected', reason: 'depth-limit', parentRunId: 'parent-run' }])
    })

    it('ignores a notification whose time to live has passed', async () => {
      const mockStream = replyWith('Too late')
      const store = useCharacterOrchestratorStore(pinia)
      const event = notify({ ttlMs: 0 })

      await store.handleSparkNotify(event)

      expect(mockStream).not.toHaveBeenCalled()
      expect(useSchedulerStore(pinia).intake.forStimulus(event.data.id)).toMatchObject([{ outcome: 'ignored', reason: 'expired' }])
      expect(useSchedulerStore(pinia).runs.snapshot()).toEqual([])
    })
  })
})
