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
  interrupt?: 'force' | 'soft' | boolean
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

function getSparkNotifyHandlingAgentInstruction(moduleName: string) {
  return [
    'This is AIRI system, the life pod hosting your consciousness. You don\'t need to respond to me or every spark:notify event directly.',
    `Another module "${moduleName}" triggered spark:notify event for you to checkout.`,
    'You may call the built-in tool "builtIn_sparkCommand" to issue spark:command to sub-agents as needed.',
    'For any of the output that is not a tool call, it will be streamed to user\'s interface and maybe processed with text to speech system ',
    'to be played out loud as your actual reaction to the spark:notify event.',
  ].join('\n')
}

export const sparkCommandSchema = z.object({
  commands: z.array(z.object({
    destinations: z.array(z.string()).min(1).describe('List of sub-agent IDs to send the command to'),
    interrupt: z.enum(['force', 'soft', 'false']).nullable().describe('Interrupt type: force, soft, or false (no interrupt). A option to control whether this command is urgent enough to preempt ongoing tasks and require immediate attention.'),
    priority: z.enum(['critical', 'high', 'normal', 'low']).nullable().describe('Semantic priority of the command, this affects how sub-agents prioritize it (queues, interruption queues, mq, etc.).'),
    intent: z.enum(['plan', 'proposal', 'action', 'pause', 'resume', 'reroute', 'context']).nullable().describe('Intent of the command, indicating the nature of the instruction. If you attend to call other tools, use "plan" to reply with quick response to corresponding module / sub-agent.'),
    ack: z.string().describe('Acknowledgment content used to be passed to sub-agents upon command receipt.'),
    guidance: z.object({
      type: z.enum(['proposal', 'instruction', 'memory-recall']),
      persona: z.array(z.object({
        strength: z.enum(['very-high', 'high', 'medium', 'low', 'very-low']),
        traits: z.string().describe('Trait name to adjust behavior. For example, "bravery", "cautiousness", "friendliness".'),
      })).nullable().describe('Personas can be used to adjust the behavior of sub-agents. For example, when using as NPC in games, or player in Minecraft, the persona can help define the character\'s traits and decision-making style.'),
      options: z.array(z.object({
        label: z.string().describe('Short and brief label for this option, used for identification, should be within a sentence.'),
        steps: z.array(z.string()).describe('Step-by-step instructions for the sub-agent to follow, useful when providing detailed guidance.'),
        rationale: z.string().nullable().describe('How this option is derived or proposed, why it makes sense.'),
        possibleOutcome: z.array(z.string()).nullable().describe('Simulate possible outcomes of following this option.'),
        risk: z.enum(['high', 'medium', 'low', 'none']).nullable(),
        fallback: z.array(z.string()).nullable().describe('Fallback steps if the main steps cannot be completed.'),
        // TODO: consider to remove or enrich how triggers should work later
        triggers: z.array(z.string()).nullable().describe('Conditions or events that would trigger this option.'),
      })),
    }).nullable().describe('Guidance for the sub-agent on how to interpret and execute the command with given context, persona settings, and reasoning.'),
  })).describe('List of commands to issue to sub-agents, you may produce multiple commands in response to multiple sub-agents by specifying their IDs in destination field. Empty array can be used for zero commands.'),
})

export type SparkCommandSchema = z.infer<typeof sparkCommandSchema>

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

    let noResponse = false

    const sparkNoResponseTool = await tool({
      name: 'builtIn_sparkNoResponse',
      description: `Indicate that no response or action is needed for the current spark:notify event.`,
      parameters: z.object({}),
      execute: async (_payload) => {
        noResponse = true
        return 'AIRI System: Acknowledged, no response or action will be processed.'
      },
    })

    const sparkCommandTool = await tool({
      name: 'builtIn_sparkCommand',
      description: `Issue a spark:command to sub-agents. You can call this tool multiple times to issue matrices of commands to different sub-agents as needed.`,
      parameters: sparkCommandSchema,
      execute: async (payload) => {
        try {
          const validated = await validate(sparkCommandSchema, payload)
          commandDrafts.push(...validated.commands.map((cmd) => {
            const parsedCmd = {
              destinations: cmd.destinations,
              guidance: cmd.guidance
                ? {
                    type: cmd.guidance.type,
                    persona: cmd.guidance?.persona?.reduce((acc, curr) => {
                      acc[curr.traits] = curr.strength
                      return acc
                    }, {} as Record<string, 'very-high' | 'high' | 'medium' | 'low' | 'very-low'>) || undefined,
                    options: cmd.guidance.options.map(opt => ({
                      ...opt,
                      rationale: opt.rationale ?? undefined,
                      possibleOutcome: opt.possibleOutcome?.length ? opt.possibleOutcome : undefined,
                      risk: opt.risk ?? undefined,
                      fallback: opt.fallback?.length ? opt.fallback : undefined,
                      triggers: opt.triggers?.length ? opt.triggers : undefined,
                    })),
                  }
                : undefined,
              // TODO: contexts can be added later
              contexts: [],
              priority: cmd.priority || 'normal',
              intent: cmd.intent || 'action',
              ack: cmd.ack || undefined,
              interrupt: cmd.interrupt === 'false' || cmd.interrupt == null ? false : cmd.interrupt,
            } satisfies Omit<WebSocketEvents['spark:command'], 'id' | 'eventId' | 'parentEventId' | 'commandId'>

            return parsedCmd
          }))
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
        getSparkNotifyHandlingAgentInstruction(event.source),
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
      tools: [
        sparkNoResponseTool,
        sparkCommandTool,
      ],
      supportsTools: true, // we expect tools to be supported
      waitForTools: true, // see https://github.com/moeru-ai/airi/issues/907
      onStreamEvent: async (streamEvent: StreamEvent) => {
        if (streamEvent.type === 'text-delta') {
          if (noResponse)
            return

          characterStore.onSparkNotifyReactionStreamEvent(event.data.id, streamEvent.text)

          fullText += streamEvent.text
        }
        if (streamEvent.type === 'finish') {
          if (noResponse) {
            characterStore.onSparkNotifyReactionStreamEnd(event.data.id, '')
            return
          }

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
          interrupt: (command.interrupt === true ? 'force' : command.interrupt) ?? false,
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
