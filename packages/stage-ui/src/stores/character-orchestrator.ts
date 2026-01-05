import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import type { StreamEvent } from './llm'

import { errorMessageFrom } from '@moeru/std'
import { tool } from '@xsai/tool'
import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'
import { validate } from 'xsschema'
import { z } from 'zod'

import { useCharacterStore } from './character'
import { useLLM } from './llm'
import { useModsServerChannelStore } from './mods/api/channel-server'
import { useConsciousnessStore } from './modules/consciousness'
import { useProvidersStore } from './providers'

interface SparkNotifyCommandDraft {
  destinations: string[]
  interrupt?: 'force' | 'soft' | false
  priority?: 'critical' | 'high' | 'normal' | 'low'
  intent?: 'plan' | 'proposal' | 'action' | 'pause' | 'resume' | 'reroute' | 'context'
  ack?: string
  guidance?: WebSocketEvents['spark:command']['guidance']
  contexts?: WebSocketEvents['spark:command']['contexts']
}

interface SparkNotifyResponse {
  reaction?: string
  commands?: SparkNotifyCommandDraft[]
}

const SPARK_NOTIFY_INSTRUCTIONS = [
  'You are processing a spark:notify event for the character.',
  'Respond with a short, in-character reaction as plain text.',
  'If you need to instruct sub-agents, call the spark_command tool one or more times.',
].join('\n')

export const sparkCommandSchema = z.object({
  commands: z.array(z.object({
    destinations: z.array(z.string()).min(1),
    interrupt: z.union([z.literal('force'), z.literal('soft'), z.literal(false)]).optional(),
    priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
    intent: z.enum(['plan', 'proposal', 'action', 'pause', 'resume', 'reroute', 'context']).optional(),
    ack: z.string().optional(),
    guidance: z.object({
      type: z.enum(['proposal', 'instruction', 'memory-recall']),
      persona: z.record(z.string(), z.enum(['very-high', 'high', 'medium', 'low', 'very-low'])).optional(),
      options: z.array(z.object({
        label: z.string(),
        steps: z.array(z.string()),
        rationale: z.string().optional(),
        possibleOutcome: z.array(z.string()).optional(),
        risk: z.enum(['high', 'medium', 'low', 'none']).optional(),
        fallback: z.array(z.string()).optional(),
        triggers: z.array(z.string()).optional(),
      })),
    }).optional(),
    contexts: z.array(z.any()).optional(),
  })),
})

export const useCharacterOrchestratorStore = defineStore('character-orchestrator', () => {
  const { stream } = useLLM()
  const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
  const providersStore = useProvidersStore()
  const characterStore = useCharacterStore()
  const { systemPrompt } = storeToRefs(characterStore)
  const modsServerChannelStore = useModsServerChannelStore()

  const processing = ref(false)
  const pendingNotifies = ref<Array<WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify']>>>([])

  async function runNotifyAgent(event: WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify']>) {
    if (!activeProvider.value || !activeModel.value) {
      console.warn('Spark notify ignored: missing active provider or model')
      return undefined
    }

    const chatProvider = await providersStore.getProviderInstance<ChatProvider>(activeProvider.value)
    const commandDrafts: SparkNotifyCommandDraft[] = []

    const sparkCommandTool = await tool({
      name: 'spark_command',
      description: `Issue a spark:command to sub-agents.`,
      parameters: sparkCommandSchema,
      execute: async (payload) => {
        try {
          const validated = await validate(sparkCommandSchema, payload)
          commandDrafts.push(...validated.commands)
        }
        catch (error) {
          return `AIRI System: Error - invalid spark_command parameters: ${errorMessageFrom(error)}`
        }

        return 'AIRI System: Acknowledged, command fired.'
      },
    })

    const systemMessage: Message = {
      role: 'system',
      content: [
        systemPrompt.value,
        SPARK_NOTIFY_INSTRUCTIONS,
      ].filter(Boolean).join('\n\n'),
    }

    const userMessage: Message = {
      role: 'user',
      content: JSON.stringify({
        notify: event.data,
        source: event.source,
      }, null, 2),
    }

    let fullText = ''

    await stream(activeModel.value, chatProvider, [systemMessage, userMessage], {
      tools: [sparkCommandTool],
      onStreamEvent: async (streamEvent: StreamEvent) => {
        if (streamEvent.type === 'text-delta') {
          characterStore.onSparkNotifyReactionStreamEvent(event.data.id, streamEvent.text)

          fullText += streamEvent.text
        }
        if (streamEvent.type === 'finish') {
          characterStore.onSparkNotifyReactionStreamEnd(event.data.id, fullText)
        }
        if (streamEvent.type === 'error') {
          characterStore.onSparkNotifyReactionStreamEnd(event.data.id, fullText)
          throw streamEvent.error ?? new Error('Spark notify stream error')
        }
      },
    })

    return {
      reaction: fullText.trim(),
      commands: commandDrafts,
    } satisfies SparkNotifyResponse
  }

  async function handleSparkNotify(event: WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify']>) {
    if (event.data.urgency !== 'immediate' && pendingNotifies.value.length > 0) {
      pendingNotifies.value = [...pendingNotifies.value, event]
      return undefined
    }
    if (processing.value) {
      pendingNotifies.value = [...pendingNotifies.value, event]
      return undefined
    }

    processing.value = true

    try {
      const response = await runNotifyAgent(event)
      if (!response)
        return undefined

      const commands = (response.commands ?? [])
        .map(command => ({
          id: nanoid(),
          eventId: nanoid(),
          parentEventId: event.data.id,
          commandId: nanoid(),
          interrupt: command.interrupt ?? false,
          priority: command.priority ?? 'normal',
          intent: command.intent ?? 'action',
          ack: command.ack,
          guidance: command.guidance,
          contexts: command.contexts,
          destinations: command.destinations ?? [],
        } satisfies WebSocketEvents['spark:command']))
        .filter(command => command.destinations.length > 0)

      return {
        commands,
      }
    }
    finally {
      processing.value = false
    }
  }

  async function handleSparkEmit(_: WebSocketBaseEvent<'spark:emit', WebSocketEvents['spark:emit']>) {
    // Currently no-op
    return undefined
  }

  function initialize() {
    modsServerChannelStore.onEvent('spark:notify', async (event) => {
      try {
        const result = await handleSparkNotify(event)
        if (!result?.commands?.length)
          return

        for (const command of result.commands) {
          modsServerChannelStore.send({
            type: 'spark:command',
            data: command,
          })
        }
      }
      catch (error) {
        console.warn('Failed to handle spark:notify event:', error)
      }
    })

    modsServerChannelStore.onEvent('spark:emit', async (event) => {
      try {
        await handleSparkEmit(event)
      }
      catch (error) {
        console.warn('Failed to handle spark:emit event:', error)
      }
    })
  }

  return {
    processing,
    pendingNotifies,

    initialize,

    handleSparkNotify,
    handleSparkEmit,
  }
})
