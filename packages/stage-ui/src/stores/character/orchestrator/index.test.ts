/* eslint-disable style/indent-binary-ops */
/* eslint-disable style/operator-linebreak */

import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { Pinia, Store, StoreDefinition } from 'pinia'
import type { Mock } from 'vitest'
import type { UnwrapRef } from 'vue'
import type z from 'zod'

import type { StreamEvent } from '../../ai/chat-llm/llm'
import type { AiriCard } from '../../modules'

import { tool } from '@xsai/tool'
import { nanoid } from 'nanoid'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { sparkNotifyCommandSchema, useCharacterOrchestratorStore } from '.'
import { useCharacterStore } from '..'
import { useLLM } from '../../ai/chat-llm/llm'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useAiriCardStore, useConsciousnessStore } from '../../modules'
import { useProviderStore } from '../../providers/provider'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

function getArraySchema(schema?: Record<string, any>) {
  if (!schema)
    return undefined

  if (schema.type === 'array')
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
  return candidates.find((candidate: Record<string, any>) => candidate?.type === 'array')
}

function getObjectSchema(schema?: Record<string, any>) {
  if (!schema)
    return undefined

  if (schema.type === 'object')
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])]
  return candidates.find((candidate: Record<string, any>) => candidate?.type === 'object')
}

function mockedStore<TStoreDef extends (pinia?: Pinia) => unknown>(
  useStore: TStoreDef,
  pinia?: Pinia,
): TStoreDef extends StoreDefinition<
  infer Id,
  infer State,
  infer Getters,
  infer Actions
>
  ? {
    [K in keyof Getters]: UnwrapRef<Getters[K]>
  } & Store<
    Id,
    State,
    Record<string, never>,
    {
      [K in keyof Actions]: Actions[K] extends (...args: any[]) => any
        ? // 👇 depends on your testing framework
        Mock<Actions[K]>
        : Actions[K]
    }
  >
  : ReturnType<TStoreDef> {
  return useStore(pinia) as any
}

describe('sparkNotifyCommandSchema', () => {
  it('emits strict objects in the json schema', async () => {
    const sparkTool = await tool({
      description: 'test',
      execute: async () => undefined,
      name: 'builtIn_sparkCommand',
      parameters: sparkNotifyCommandSchema,
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
    mockedStore(useProviderStore, pinia).getChatProviderInstance.mockResolvedValue({ chat: (_model: string) => ({} as any) })

    const consciousnessStore = useConsciousnessStore(pinia)
    consciousnessStore.activeProvider = 'mock-provider'
    consciousnessStore.activeModel = 'mock-model'

    const airiCardStore = useAiriCardStore(pinia)
    // @ts-expect-error - testing purpose
    airiCardStore.systemPrompt = 'You are a brave adventurer in Minecraft.'
    // @ts-expect-error - testing purpose
    airiCardStore.activeCard = {
      extensions: {
        airi: {
          agents: {},
          modules: {
            consciousness: {
              model: 'mock-model',
              provider: 'mock-provider',
            },
            speech: {
              model: 'mock-speech-model',
              provider: 'mock-speech-provider',
              voice_id: 'alloy',
            },
            vision: {
              model: 'mock-vision-model',
              provider: 'mock-vision-provider',
            },
          },
        },
      },
      name: 'Hero',
      version: '1.0',
    } satisfies AiriCard
  })

  it('handles immediate spark:notify with reaction and commands', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM, pinia).stream = mockStream
    mockedStore(useLLM, pinia).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      if (options?.tools?.length) {
        await options.tools[1].execute({ commands: [{
          ack: 'ok',
          destinations: ['minecraft'],
          guidance: null,
          intent: 'action',
          interrupt: 'false',
          priority: 'critical',
        }] } satisfies z.infer<typeof sparkNotifyCommandSchema>)
      }

      await options?.onStreamEvent?.({ text: 'Ahhh, got hit by zombie!', type: 'text-delta' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const mockOnSparkNotifyReactionStreamEvent = vi.fn()
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEvent = mockOnSparkNotifyReactionStreamEvent
    const mockOnSparkNotifyReactionStreamEnd = vi.fn()
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEnd = mockOnSparkNotifyReactionStreamEnd

    const store = useCharacterOrchestratorStore(pinia)
    const event: WebSocketEventOf<'spark:notify'> = {
      data: {
        destinations: ['character'],
        eventId: nanoid(),
        headline: 'Hit by zombie',
        id: nanoid(),
        kind: 'alarm',
        urgency: 'immediate',
      },
      source: 'minecraft',
      type: 'spark:notify',
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
    expect(mockStream.mock.calls[0][2]).toHaveLength(2)
    expect(mockStream.mock.calls[0][3]).toHaveProperty('tools')

    expect(mockOnSparkNotifyReactionStreamEvent).toHaveBeenCalledWith(event.data.id, 'Ahhh, got hit by zombie!')
    expect(mockOnSparkNotifyReactionStreamEnd).toHaveBeenCalledTimes(1)
  })

  it('supports forcing text-only spark:notify responses', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM, pinia).stream = mockStream
    mockedStore(useLLM, pinia).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      await options?.onStreamEvent?.({ text: 'I choose d5 to pressure the center.', type: 'text-delta' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const onDelta = vi.fn()
    const onEnd = vi.fn()
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEvent = onDelta
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEnd = onEnd

    const store = useCharacterOrchestratorStore(pinia)
    const event: WebSocketEventOf<'spark:notify'> = {
      data: {
        destinations: ['character'],
        eventId: nanoid(),
        headline: 'AIRI played d5',
        id: nanoid(),
        kind: 'ping',
        urgency: 'immediate',
      },
      source: 'plugin:airi-plugin-game-chess',
      type: 'spark:notify',
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
          ack: 'go',
          destinations: ['minecraft'],
          guidance: null,
          intent: 'action',
          interrupt: 'false',
          priority: 'high',
        }],
      } satisfies z.infer<typeof sparkNotifyCommandSchema>)
      await options?.onStreamEvent?.({ text: 'This should be ignored.', type: 'text-delta' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const onDelta = vi.fn()
    const onEnd = vi.fn()
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEvent = onDelta
    mockedStore(useCharacterStore, pinia).onSparkNotifyReactionStreamEnd = onEnd

    const store = useCharacterOrchestratorStore(pinia)
    const event: WebSocketEventOf<'spark:notify'> = {
      data: {
        destinations: ['character'],
        eventId: nanoid(),
        headline: 'Take cover',
        id: nanoid(),
        kind: 'alarm',
        urgency: 'immediate',
      },
      source: 'minecraft',
      type: 'spark:notify',
    }

    const result = await store.handleSparkNotify(event, {
      forceSparkCommandResponse: true,
    })

    const streamOptions = mockStream.mock.lastCall?.[3]
    expect(streamOptions).toMatchObject({
      supportsTools: true,
      toolChoice: {
        function: { name: 'builtIn_sparkCommand' },
        type: 'function',
      },
      waitForTools: true,
    })
    expect(result?.commands?.length).toBe(1)
    expect(sendSparkCommandMock).toHaveBeenCalledWith({
      data: result?.commands[0],
      type: 'spark:command',
    })
    expect(onDelta).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledWith(event.data.id, '')
  })

  it('forwards runtime-only message overrides into the rendered spark prompt', async () => {
    const mockStream = vi.fn()
    mockedStore(useLLM, pinia).stream = mockStream
    mockedStore(useLLM, pinia).stream.mockImplementation(async (_model: string, _provider: unknown, _messages: unknown, options: any) => {
      await options?.onStreamEvent?.({ text: 'legacy-safe text', type: 'text-delta' } satisfies StreamEvent)
      await options?.onStreamEvent?.({ type: 'finish' } satisfies StreamEvent)
    })

    const store = useCharacterOrchestratorStore(pinia)
    const event: WebSocketEventOf<'spark:notify'> = {
      data: {
        destinations: ['character'],
        eventId: nanoid(),
        headline: 'Legacy rendering',
        id: nanoid(),
        kind: 'ping',
        urgency: 'immediate',
      },
      source: 'plugin:airi-plugin-game-chess',
      type: 'spark:notify',
    }

    await store.handleSparkNotify(event, {
      forceTextResponse: true,
      messageOverride: {
        appendSystemInstructions: ['Plugin-specific hint'],
        appendUserSections: ['Rendered board snapshot'],
      },
    })

    const renderedMessages = mockStream.mock.lastCall?.[2] as Array<{ content: string, role: string }> | undefined
    expect(String(renderedMessages?.[0]?.content)).toContain('Plugin-specific hint')
    expect(String(renderedMessages?.[1]?.content)).toContain('Rendered board snapshot')
  })
})
