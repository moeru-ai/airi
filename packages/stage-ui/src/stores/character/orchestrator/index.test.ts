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
import { ref } from 'vue'

import { sparkNotifyCommandSchema, useCharacterOrchestratorStore } from '.'
import { useCharacterStore } from '..'
import { useLLM } from '../../ai/chat-llm/llm'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useAiriCardStore, useConsciousnessStore } from '../../modules'
import { useProviderStore } from '../../providers/provider'

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
    mockedStore(useProviderStore, pinia).getChatProviderInstance.mockResolvedValue({ chat: (_model: string) => ({} as any) })

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
    expect(mockStream.mock.calls[0][2]).toHaveLength(2)
    expect(mockStream.mock.calls[0][3]).toHaveProperty('tools')

    expect(mockOnSparkNotifyReactionStreamEvent).toHaveBeenCalledWith(event.data.id, 'Ahhh, got hit by zombie!')
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
    expect(sendSparkCommandMock).toHaveBeenCalledWith({
      type: 'spark:command',
      data: result?.commands[0],
    })
    expect(onDelta).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledWith(event.data.id, '')
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

    const renderedMessages = mockStream.mock.lastCall?.[2] as Array<{ role: string, content: string }> | undefined
    expect(String(renderedMessages?.[0]?.content)).toContain('Plugin-specific hint')
    expect(String(renderedMessages?.[1]?.content)).toContain('Replacement user payload')
    expect(String(renderedMessages?.[1]?.content)).toContain('Rendered board snapshot')
    expect(String(renderedMessages?.[1]?.content)).toContain('base.prompt.emotion')
    expect(String(renderedMessages?.[1]?.content)).toContain('base.prompt.emoji')
  })
})
