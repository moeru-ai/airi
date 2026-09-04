import type { ProtocolEvents } from '@proj-airi/plugin-protocol/types'
import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { Message, ToolChoice } from '@xsai/shared-chat'

import type { SparkNotifyCommandDraft } from './tools'
import type {
  SparkNotifyPlugin,
  SparkNotifyPluginSession,
  SparkNotifyResponseControl,
  SparkNotifyRunner,
  SparkNotifyRuntimeEvent,
  SparkNotifyRuntimePolicy,
  SparkNotifySelectedChat,
} from './types'

import { nanoid } from 'nanoid'

import { getEventSourceKey } from './event-source'
import { createSparkNotifyBuiltinToolsPlugin } from './plugins/builtin-tools'

/**
 * Final `spark:command` payload emitted by the notify runtime.
 *
 * The protocol allows `eventId` and `parentEventId` to be absent. This runtime
 * generates both IDs for every emitted command, so they are required here.
 */
export type SparkNotifyCommandEvent = Pick<
  ProtocolEvents['spark:command'],
  | 'id'
  | 'commandId'
  | 'interrupt'
  | 'priority'
  | 'intent'
  | 'ack'
  | 'guidance'
  | 'contexts'
  | 'destinations'
> & Required<Pick<ProtocolEvents['spark:command'], 'eventId' | 'parentEventId'>>

/** Result from one complete Spark Notify turn. */
export interface SparkNotifyHandleResult {
  commands: SparkNotifyCommandEvent[]
}

/** Input that the host gives to a Spark Notify agent for one execution. */
export interface SparkNotifyHandleRequest {
  event: WebSocketEventOf<'spark:notify'>
  selectedChat: SparkNotifySelectedChat
  systemPrompt: string
  /** Runtime instructions appended to the user message for this request. */
  runtimePrompt?: string
  control?: SparkNotifyResponseControl
}

/** Platform-neutral agent that handles exactly one prepared Spark Notify turn. */
export interface SparkNotifyAgent {
  handle: (request: SparkNotifyHandleRequest) => Promise<SparkNotifyHandleResult>
}

/** Configuration for a Spark Notify agent. */
export interface CreateSparkNotifyAgentOptions {
  /** Host boundary that streams the selected chat model. */
  runner: SparkNotifyRunner
  /** Optional plugins that add prompt context, tools, output sinks, or observers. */
  plugins?: SparkNotifyPlugin[]
  /** ID factory for generated Spark Command envelopes. */
  createId?: () => string
}

function renderSparkNotifyUserMessage(input: SparkNotifyHandleRequest, userSections: string[]) {
  const messageOverride = input.control?.messageOverride
  const defaultUserMessage = JSON.stringify({
    notify: input.event.data,
    source: input.event.metadata?.source,
  }, null, 2)

  return [
    messageOverride?.replaceUserMessage ?? defaultUserMessage,
    ...(messageOverride?.appendUserSections ?? []),
    input.runtimePrompt ?? '',
    ...userSections,
  ].filter(section => section.trim().length > 0).join('\n\n')
}

/** Builds the instruction block prepended to Spark Notify agent prompts. */
export function getSparkNotifyHandlingAgentInstruction(moduleName: string) {
  return [
    'This is AIRI system, the life pod hosting your consciousness. You do not need to respond to every spark:notify event directly.',
    `Another module "${moduleName}" triggered a spark:notify event for you to inspect.`,
    'You can call the built-in tool "builtIn_sparkCommand" to issue spark:command to sub-agents.',
    'If you respond with text, write only the reaction that the character will say.',
  ].join('\n')
}

function resolveSparkNotifyRuntimePolicy(control?: SparkNotifyResponseControl): SparkNotifyRuntimePolicy {
  if (control?.forceTextResponse) {
    return {
      allowNoResponse: false,
      allowSparkCommand: false,
      supportsTools: false,
      waitForTools: false,
      ignoreTextOutput: false,
    }
  }

  if (control?.forceSparkCommandResponse) {
    return {
      allowNoResponse: false,
      allowSparkCommand: true,
      supportsTools: true,
      waitForTools: true,
      toolChoice: {
        type: 'function',
        function: { name: 'builtIn_sparkCommand' },
      } satisfies ToolChoice,
      ignoreTextOutput: true,
    }
  }

  if (control?.forceResponse) {
    return {
      allowNoResponse: false,
      allowSparkCommand: true,
      supportsTools: true,
      waitForTools: true,
      ignoreTextOutput: false,
    }
  }

  return {
    allowNoResponse: true,
    allowSparkCommand: true,
    supportsTools: true,
    waitForTools: true,
    ignoreTextOutput: false,
  }
}

function resultFrom(sessions: SparkNotifyPluginSession[]) {
  const commands: SparkNotifyCommandDraft[] = []
  let noResponse = false

  for (const session of sessions) {
    const result = session.getResult?.()
    if (result?.commands)
      commands.push(...result.commands)
    noResponse ||= result?.noResponse === true
  }

  return { commands, noResponse }
}

function expandCommand(event: WebSocketEventOf<'spark:notify'>, command: SparkNotifyCommandDraft, createId: () => string): SparkNotifyCommandEvent | undefined {
  const destinations = command.destinations ?? []
  if (destinations.length === 0)
    return undefined

  return {
    id: createId(),
    eventId: createId(),
    parentEventId: event.data.id,
    commandId: createId(),
    interrupt: (command.interrupt === true ? 'force' : command.interrupt) ?? false,
    priority: command.priority ?? 'normal',
    intent: command.intent ?? 'action',
    ack: command.ack,
    guidance: command.guidance,
    contexts: command.contexts,
    destinations,
  }
}

/**
 * Creates a Spark Notify agent from one host runner and composable plugins.
 *
 * The host resolves model selection and schedules work. This agent only
 * prepares and runs one notify turn.
 */
export function createSparkNotifyAgent(options: CreateSparkNotifyAgentOptions): SparkNotifyAgent {
  const createId = options.createId ?? nanoid
  const plugins = [createSparkNotifyBuiltinToolsPlugin(), ...(options.plugins ?? [])]

  async function handle(request: SparkNotifyHandleRequest): Promise<SparkNotifyHandleResult> {
    const policy = resolveSparkNotifyRuntimePolicy(request.control)

    const preparedSessions = await Promise.all(
      plugins.map((plugin) => {
        return plugin.prepare({
          event: request.event,
          selectedChat: request.selectedChat,
          systemPrompt: request.systemPrompt,
          control: request.control,
          policy,
        })
      }),
    )
    const sessions = preparedSessions.filter((session): session is SparkNotifyPluginSession => session !== undefined)
    const systemInstructions = sessions.flatMap(session => session.systemInstructions ?? [])
    const userSections = sessions.flatMap(session => session.userSections ?? [])
    const tools = policy.supportsTools
      ? sessions.flatMap(session => session.tools ?? [])
      : []

    const messages: Message[] = [
      {
        role: 'system',
        content: [
          request.systemPrompt,
          getSparkNotifyHandlingAgentInstruction(getEventSourceKey(request.event)),
          ...(request.control?.messageOverride?.appendSystemInstructions ?? []),
          ...systemInstructions,
        ].filter(Boolean).join('\n\n'),
      },
      {
        role: 'user',
        content: renderSparkNotifyUserMessage(request, userSections),
      },
    ]

    async function emit(event: SparkNotifyRuntimeEvent) {
      for (const session of sessions)
        await session.onEvent?.(event)
    }

    await emit({ type: 'messages-rendered', payload: { eventId: request.event.data.eventId, source: request.event.source, messageCount: messages.length } })
    await emit({ type: 'tools-prepared', payload: { eventId: request.event.data.eventId, toolNames: tools.flatMap(tool => tool.function?.name ? [tool.function.name] : []), toolCount: tools.length, supportsTools: policy.supportsTools } })
    await emit({ type: 'model-input', payload: { eventId: request.event.data.eventId, model: request.selectedChat.model, provider: request.selectedChat.providerId, supportsTools: policy.supportsTools, waitForTools: policy.waitForTools } })

    let reaction = ''
    await options.runner.run({
      selectedChat: request.selectedChat,
      messages,
      tools,
      policy,
      onStreamEvent: async (streamEvent) => {
        if (streamEvent.type === 'text-delta') {
          const { noResponse } = resultFrom(sessions)
          if (policy.ignoreTextOutput || noResponse)
            return

          reaction += streamEvent.text
          await emit({ type: 'model-output-text', payload: { eventId: request.event.data.id, text: streamEvent.text, accumulatedText: reaction } })
          return
        }

        if (streamEvent.type === 'tool-call') {
          await emit({ type: 'model-output-tool-call', payload: { eventId: request.event.data.eventId, toolCallId: streamEvent.id, toolName: streamEvent.function.name, input: streamEvent.function.arguments } })
          return
        }

        if (streamEvent.type === 'tool-result' || streamEvent.type === 'tool-error') {
          await emit({ type: 'tool-execution', payload: { eventId: request.event.data.eventId, kind: streamEvent.type, toolCallId: streamEvent.toolCallId, output: streamEvent.result } })
          return
        }

        if (streamEvent.type === 'error')
          throw streamEvent.error ?? new Error('Spark notify stream error')
      },
    })

    for (const session of sessions) {
      for (const event of session.getPendingEvents?.() ?? [])
        await emit(event)
    }

    const { commands, noResponse } = resultFrom(sessions)
    const finalReaction = noResponse ? '' : reaction.trim()
    const expandedCommands = commands
      .map(command => expandCommand(request.event, command, createId))
      .filter((command): command is SparkNotifyCommandEvent => command !== undefined)

    await emit({ type: 'result', payload: { eventId: request.event.data.eventId, reaction: finalReaction, commandCount: expandedCommands.length, noResponse } })
    return { commands: expandedCommands }
  }

  return { handle }
}
