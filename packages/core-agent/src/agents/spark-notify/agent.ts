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

/** Configuration for a Spark Notify agent. */
export interface CreateSparkNotifyAgentOptions {
  /** ID factory for generated Spark Command envelopes. */
  createId?: () => string
  /** Optional plugins that add prompt context, tools, output sinks, or observers. */
  plugins?: SparkNotifyPlugin[]
  /** Host boundary that streams the selected chat model. */
  runner: SparkNotifyRunner
}

/** Platform-neutral agent that handles exactly one prepared Spark Notify turn. */
export interface SparkNotifyAgent {
  handle: (request: SparkNotifyHandleRequest) => Promise<SparkNotifyHandleResult>
}

/**
 * Final `spark:command` payload emitted by the notify runtime.
 *
 * The protocol allows `eventId` and `parentEventId` to be absent. This runtime
 * generates both IDs for every emitted command, so they are required here.
 */
export type SparkNotifyCommandEvent = Pick<
  ProtocolEvents['spark:command'],
  | 'ack'
  | 'commandId'
  | 'contexts'
  | 'destinations'
  | 'guidance'
  | 'id'
  | 'intent'
  | 'interrupt'
  | 'priority'
> & Required<Pick<ProtocolEvents['spark:command'], 'eventId' | 'parentEventId'>>

/** Input that the host gives to a Spark Notify agent for one execution. */
export interface SparkNotifyHandleRequest {
  control?: SparkNotifyResponseControl
  event: WebSocketEventOf<'spark:notify'>
  selectedChat: SparkNotifySelectedChat
  systemPrompt: string
}

/** Result from one complete Spark Notify turn. */
export interface SparkNotifyHandleResult {
  commands: SparkNotifyCommandEvent[]
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
          control: request.control,
          event: request.event,
          policy,
          selectedChat: request.selectedChat,
          systemPrompt: request.systemPrompt,
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
        content: [
          request.systemPrompt,
          getSparkNotifyHandlingAgentInstruction(getEventSourceKey(request.event)),
          ...(request.control?.messageOverride?.appendSystemInstructions ?? []),
          ...systemInstructions,
        ].filter(Boolean).join('\n\n'),
        role: 'system',
      },
      {
        content: renderSparkNotifyUserMessage(request, userSections),
        role: 'user',
      },
    ]

    async function emit(event: SparkNotifyRuntimeEvent) {
      for (const session of sessions)
        await session.onEvent?.(event)
    }

    await emit({ payload: { eventId: request.event.data.eventId, messageCount: messages.length, source: request.event.source }, type: 'messages-rendered' })
    await emit({ payload: { eventId: request.event.data.eventId, supportsTools: policy.supportsTools, toolCount: tools.length, toolNames: tools.flatMap(tool => tool.function?.name ? [tool.function.name] : []) }, type: 'tools-prepared' })
    await emit({ payload: { eventId: request.event.data.eventId, model: request.selectedChat.model, provider: request.selectedChat.providerId, supportsTools: policy.supportsTools, waitForTools: policy.waitForTools }, type: 'model-input' })

    let reaction = ''
    await options.runner.run({
      messages,
      onStreamEvent: async (streamEvent) => {
        if (streamEvent.type === 'text-delta') {
          const { noResponse } = resultFrom(sessions)
          if (policy.ignoreTextOutput || noResponse)
            return

          reaction += streamEvent.text
          await emit({ payload: { accumulatedText: reaction, eventId: request.event.data.id, text: streamEvent.text }, type: 'model-output-text' })
          return
        }

        if (streamEvent.type === 'tool-call') {
          await emit({ payload: { eventId: request.event.data.eventId, input: streamEvent.function.arguments, toolCallId: streamEvent.id, toolName: streamEvent.function.name }, type: 'model-output-tool-call' })
          return
        }

        if (streamEvent.type === 'tool-result' || streamEvent.type === 'tool-error') {
          await emit({ payload: { eventId: request.event.data.eventId, kind: streamEvent.type, output: streamEvent.result, toolCallId: streamEvent.toolCallId }, type: 'tool-execution' })
          return
        }

        if (streamEvent.type === 'error')
          throw streamEvent.error ?? new Error('Spark notify stream error')
      },
      policy,
      selectedChat: request.selectedChat,
      tools,
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

    await emit({ payload: { commandCount: expandedCommands.length, eventId: request.event.data.eventId, noResponse, reaction: finalReaction }, type: 'result' })
    return { commands: expandedCommands }
  }

  return { handle }
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

function expandCommand(event: WebSocketEventOf<'spark:notify'>, command: SparkNotifyCommandDraft, createId: () => string): SparkNotifyCommandEvent | undefined {
  const destinations = command.destinations ?? []
  if (destinations.length === 0)
    return undefined

  return {
    ack: command.ack,
    commandId: createId(),
    contexts: command.contexts,
    destinations,
    eventId: createId(),
    guidance: command.guidance,
    id: createId(),
    intent: command.intent ?? 'action',
    interrupt: (command.interrupt === true ? 'force' : command.interrupt) ?? false,
    parentEventId: event.data.id,
    priority: command.priority ?? 'normal',
  }
}

function renderSparkNotifyUserMessage(input: SparkNotifyHandleRequest, userSections: string[]) {
  if (input.control?.messageOverride?.replaceUserMessage)
    return input.control.messageOverride.replaceUserMessage

  return [
    JSON.stringify({
      notify: input.event.data,
      source: input.event.metadata?.source,
    }, null, 2),
    ...(input.control?.messageOverride?.appendUserSections ?? []),
    ...userSections,
  ].filter(section => section.trim().length > 0).join('\n\n')
}

function resolveSparkNotifyRuntimePolicy(control?: SparkNotifyResponseControl): SparkNotifyRuntimePolicy {
  if (control?.forceTextResponse) {
    return {
      allowNoResponse: false,
      allowSparkCommand: false,
      ignoreTextOutput: false,
      supportsTools: false,
      waitForTools: false,
    }
  }

  if (control?.forceSparkCommandResponse) {
    return {
      allowNoResponse: false,
      allowSparkCommand: true,
      ignoreTextOutput: true,
      supportsTools: true,
      toolChoice: {
        function: { name: 'builtIn_sparkCommand' },
        type: 'function',
      } satisfies ToolChoice,
      waitForTools: true,
    }
  }

  if (control?.forceResponse) {
    return {
      allowNoResponse: false,
      allowSparkCommand: true,
      ignoreTextOutput: false,
      supportsTools: true,
      waitForTools: true,
    }
  }

  return {
    allowNoResponse: true,
    allowSparkCommand: true,
    ignoreTextOutput: false,
    supportsTools: true,
    waitForTools: true,
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
