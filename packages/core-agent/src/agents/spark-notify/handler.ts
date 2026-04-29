import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { ChatProvider, ChatProviderWithExtraOptions, EmbedProvider, EmbedProviderWithExtraOptions, SpeechProvider, SpeechProviderWithExtraOptions, TranscriptionProvider, TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { Message, Tool, ToolChoice } from '@xsai/shared-chat'

import type { StreamEvent } from '../../types/llm'
import type { SparkNotifyCommandDraft } from './tools'
import type {
  SparkNotifyMessageOverride,
  SparkNotifyResponseControl,
  SparkNotifyRuntimePolicy,
  SparkNotifyTracingHooks,
  SparkTraceEvent,
} from './types'

import { nanoid } from 'nanoid'

import { getEventSourceKey } from './event-source'
import { createSparkNotifyTools } from './tools'

export type { SparkNotifyCommandSchema } from './schema'
export { sparkNotifyCommandSchema } from './schema'
export type { SparkNotifyCommandDraft } from './tools'

/**
 * Raw spark-notify model response before runtime command event expansion.
 */
export interface SparkNotifyResponse {
  /** Free-form reaction text streamed back to the caller when the model emits text output. */
  reaction?: string
  /** Command drafts collected from `builtIn_sparkCommand` tool calls before runtime event expansion. */
  commands?: SparkNotifyCommandDraft[]
}

/**
 * Final command event emitted by the notify runtime.
 */
export interface SparkNotifyCommandEvent {
  /** Stable runtime event ID generated for the emitted `spark:command` envelope. */
  id: string
  /** Original command event identifier inherited from the notify response flow. */
  eventId: string
  /** Parent `spark:notify` event ID that caused this command to be emitted. */
  parentEventId: string
  /** Stable per-command identifier generated for downstream orchestration. */
  commandId: string
  /** Interrupt mode forwarded to downstream consumers. */
  interrupt: 'force' | 'soft' | false
  /** Command priority used by downstream schedulers. */
  priority: 'critical' | 'high' | 'normal' | 'low'
  /** Intent label that describes why the downstream agent should process the command. */
  intent: 'plan' | 'proposal' | 'action' | 'pause' | 'resume' | 'reroute' | 'context'
  /** Optional acknowledgement text that can be surfaced by the downstream consumer. */
  ack?: string
  /** Optional structured guidance assembled by the notify agent for the downstream command target. */
  guidance?: SparkNotifyCommandDraft['guidance']
  /** Optional context patches that should accompany the emitted command. */
  contexts?: SparkNotifyCommandDraft['contexts']
  /** Destination agent or lane identifiers that should receive the command. */
  destinations: string[]
}

/**
 * Handler result after runtime command expansion finishes.
 */
export interface SparkNotifyHandleResult {
  /** Expanded runtime command events ready to enqueue or emit downstream. */
  commands: SparkNotifyCommandEvent[]
}

/**
 * Snapshot of spark runtime trace artifacts for eval harnesses.
 */
export interface SparkTraceCapture {
  /** Ordered trace events emitted by the runtime while handling the notify event. */
  events: SparkTraceEvent[]
  /** Final rendered messages passed into the model call. */
  renderedMessages: Message[]
  /** Tool metadata exposed to the model for the current run. */
  toolExposure: Array<{
    /** Provider-visible tool name. */
    name: string
    /** Provider-visible tool description, if supplied by the tool wrapper. */
    description?: string
  }>
  /** Convenience list of exposed tool names extracted from `toolExposure`. */
  toolNames: string[]
  /** Raw model input snapshots captured before each provider call. */
  modelInputs: Array<{
    /** `spark:notify` event identifier associated with the model call. */
    eventId: string
    /** Concrete model name used for the provider request. */
    model: string
    /** Active provider identifier used for the model request. */
    provider: string
    /** Rendered chat messages sent to the provider. */
    messages: Message[]
    /** Provider tool selection policy, when one was enforced. */
    toolChoice: ToolChoice | null
    /** Whether the active provider call exposed tools at all. */
    supportsTools: boolean
    /** Whether the runtime waited for tool execution before finishing the call. */
    waitForTools: boolean
  }>
  /** Raw model output events captured during streaming, including tool activity. */
  modelOutputs: Array<{
    /** `spark:notify` event identifier associated with the streaming output. */
    eventId: string
    /** Output event category emitted by the stream adapter. */
    kind: 'text-delta' | 'tool-call' | 'tool-result'
    /** Tool name referenced by the output event, when applicable. */
    toolName?: string
    /** Provider tool call identifier, when applicable. */
    toolCallId?: string
    /** Incremental text chunk emitted by the model. */
    text?: string
    /** Accumulated text at the time the output event was captured. */
    accumulatedText?: string
    /** Tool input payload emitted by the provider. */
    input?: unknown
    /** Tool execution output captured by the runtime. */
    output?: unknown
    /** Tool execution error captured by the runtime. */
    error?: string
  }>
  /** Convenience view of tool-call events extracted from `modelOutputs`. */
  toolCalls: Array<{
    /** `spark:notify` event identifier associated with the tool call. */
    eventId: string
    /** Tool name referenced by the provider. */
    toolName?: string
    /** Provider tool call identifier. */
    toolCallId?: string
    /** Tool input payload captured from the provider stream. */
    input?: unknown
  }>
  /** Convenience view of tool execution results extracted from trace events. */
  toolExecutions: Array<{
    /** `spark:notify` event identifier associated with the tool execution. */
    eventId: string
    /** Tool name executed by the runtime. */
    toolName?: string
    /** Provider tool call identifier. */
    toolCallId?: string
    /** Tool input payload passed into runtime execution. */
    input?: unknown
    /** Tool output payload returned by runtime execution. */
    output?: unknown
    /** Tool execution error, when the runtime rejected or failed the call. */
    error?: string
  }>
  /** Final response snapshot captured after command expansion finishes. */
  finalResult?: {
    /** `spark:notify` event identifier associated with the final result. */
    eventId: string
    /** Final reaction text returned to the caller. */
    reaction: string
    /** Command drafts produced by the notify runtime before websocket event expansion. */
    commands: SparkNotifyCommandDraft[]
    /** Number of command drafts emitted for the run. */
    commandCount: number
    /** Whether the model selected the `builtIn_sparkNoResponse` pathway. */
    noResponse: boolean
    /** Whether tools were exposed to the provider for this run. */
    supportsTools: boolean
  }
}

/**
 * Serializes one spark-notify payload into the user message content sent to the model.
 *
 * Use when:
 * - A runtime needs the default JSON envelope for spark-notify
 * - A host optionally appends one-off serialized context sections for the current run
 *
 * Expects:
 * - `messageOverride` content to already be provider-safe text
 *
 * Returns:
 * - A single provider-ready user message string
 */
function renderSparkNotifyUserMessage(input: {
  event: WebSocketEventOf<'spark:notify'>
  messageOverride?: SparkNotifyMessageOverride
}) {
  if (input.messageOverride?.replaceUserMessage) {
    return input.messageOverride.replaceUserMessage
  }

  const sections = [
    JSON.stringify({
      notify: input.event.data,
      source: input.event.source,
    }, null, 2),
    ...(input.messageOverride?.appendUserSections ?? []),
  ].filter(section => section.trim().length > 0)

  return sections.join('\n\n')
}

/**
 * Dependency bag required by the spark-notify runtime.
 */
export interface SparkNotifyAgentDeps extends SparkNotifyTracingHooks {
  /** Streams one notify-agent model call with the provided messages and tool policy. */
  stream: (
    model: string,
    provider: ChatProvider,
    messages: Message[],
    options: {
      tools?: Tool[]
      supportsTools?: boolean
      waitForTools?: boolean
      toolChoice?: ToolChoice
      onStreamEvent?: (event: StreamEvent) => void | Promise<void>
    },
  ) => Promise<void>
  /** Returns the currently selected provider name, if any. */
  getActiveProvider: () => string | undefined
  /** Returns the currently selected model name, if any. */
  getActiveModel: () => string | undefined
  /** Resolves the provider instance used for the active model call. */
  getProviderInstance: <R extends
  | ChatProvider
  | ChatProviderWithExtraOptions
  | EmbedProvider
  | EmbedProviderWithExtraOptions
  | SpeechProvider
  | SpeechProviderWithExtraOptions
  | TranscriptionProvider
  | TranscriptionProviderWithExtraOptions,
  >(name: string,
  ) => Promise<R>
  /** Receives incremental text deltas while the reaction is streaming. */
  onReactionDelta: (eventId: string, text: string) => void
  /** Receives the final reaction text after streaming completes. */
  onReactionEnd: (eventId: string, text: string) => void
  /** Returns the host-level system prompt prepended to notify runs. */
  getSystemPrompt: () => string
  /** Indicates whether the runtime is already handling another notify event. */
  getProcessing: () => boolean
  /** Updates the processing flag used to serialize notify handling. */
  setProcessing: (next: boolean) => void
  /** Returns queued `spark:notify` events that were deferred while busy. */
  getPending: () => Array<WebSocketEventOf<'spark:notify'>>
  /** Replaces the deferred `spark:notify` queue after enqueue/dequeue operations. */
  setPending: (next: Array<WebSocketEventOf<'spark:notify'>>) => void
}

/**
 * Builds the instruction block prepended to Spark Notify agent prompts.
 *
 * Use when:
 * - Handling `spark:notify` events
 * - Constructing the per-turn system instruction for the notify reaction agent
 *
 * Expects:
 * - `moduleName` resolved from event source metadata
 *
 * Returns:
 * - Multiline instruction text for system prompt composition
 */
export function getSparkNotifyHandlingAgentInstruction(moduleName: string) {
  return [
    'This is AIRI system, the life pod hosting your consciousness. You don\'t need to respond to me or every spark:notify event directly.',
    `Another module "${moduleName}" triggered spark:notify event for you to checkout.`,
    'You may call the built-in tool "builtIn_sparkCommand" to issue spark:command to sub-agents as needed.',
    'For any of the output that is not a tool call, it will be streamed to user\'s interface and maybe processed with text to speech system ',
    'to be played out loud as your actual reaction to the spark:notify event.',
  ].join('\n')
}

function resolveSparkNotifyRuntimePolicy(control?: SparkNotifyResponseControl): SparkNotifyRuntimePolicy {
  if (control?.forceTextResponse && control?.forceSparkCommandResponse) {
    console.warn('[spark:notify] forceTextResponse and forceSparkCommandResponse were both set; preferring forceTextResponse')
  }

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
        function: {
          name: 'builtIn_sparkCommand',
        },
      },
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

function traceSpark(deps: SparkNotifyTracingHooks, event: SparkTraceEvent) {
  deps.onTrace?.(event)
}

/**
 * Creates a platform-agnostic Spark Notify event handler.
 *
 * Use when:
 * - A runtime consumes websocket `spark:notify` events
 * - Reactions and command drafts should be generated by an LLM with built-in tools
 * - You want identical behavior across stage-ui and offline eval harnesses
 *
 * Expects:
 * - Stream/provider adapters and state accessors passed in `deps`
 *
 * Returns:
 * - `handle(event, control)` function that applies queue/processing policy and returns generated commands
 *
 * Call stack:
 *
 * `handle`
 *   -> `runNotifyAgent`
 *     -> `createSparkNotifyTools`
 *       -> `deps.stream`
 *         -> `deps.onReactionDelta`/`deps.onReactionEnd`
 */
export function setupAgentSparkNotifyHandler(deps: SparkNotifyAgentDeps): {
  handle: (event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) => Promise<SparkNotifyHandleResult | undefined>
} {
  async function runNotifyAgent(event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl) {
    const activeProvider = deps.getActiveProvider()
    const activeModel = deps.getActiveModel()
    if (!activeProvider || !activeModel) {
      console.warn('Spark notify ignored: missing active provider or model')
      return undefined
    }

    const runtimePolicy = resolveSparkNotifyRuntimePolicy(control)
    const chatProvider = await deps.getProviderInstance<ChatProvider>(activeProvider)
    const commandDrafts: SparkNotifyCommandDraft[] = []
    let noResponse = false

    const { tools } = await createSparkNotifyTools({
      onNoResponse: () => {
        noResponse = true
      },
      onCommands: commands => commandDrafts.push(...commands),
      onTrace: deps.onTrace,
      allowNoResponse: runtimePolicy.allowNoResponse,
      allowSparkCommand: runtimePolicy.allowSparkCommand,
    })

    const systemMessage: Message = {
      role: 'system',
      content: [
        deps.getSystemPrompt(),
        getSparkNotifyHandlingAgentInstruction(getEventSourceKey(event)),
        ...(control?.messageOverride?.appendSystemInstructions ?? []),
      ].filter(Boolean).join('\n\n'),
    }

    const userMessage: Message = {
      role: 'user',
      content: renderSparkNotifyUserMessage({
        event,
        messageOverride: control?.messageOverride,
      }),
    }

    const messages: Message[] = [systemMessage, userMessage]

    traceSpark(deps, {
      type: 'messages-rendered',
      payload: {
        eventId: event.data.eventId,
        source: event.source,
        messageCount: messages.length,
        toolCount: tools.length,
        renderedMessages: messages,
      },
    })
    traceSpark(deps, {
      type: 'tools-prepared',
      payload: {
        eventId: event.data.eventId,
        toolNames: tools.flatMap((tool) => {
          const name = tool.function?.name
          return name ? [name] : []
        }),
        toolExposure: tools.flatMap((tool) => {
          const name = tool.function?.name
          if (!name)
            return []

          return [{
            name,
            description: tool.function?.description,
          }]
        }),
        allowNoResponse: runtimePolicy.allowNoResponse,
        allowSparkCommand: runtimePolicy.allowSparkCommand,
        supportsTools: runtimePolicy.supportsTools,
        waitForTools: runtimePolicy.waitForTools,
      },
    })
    traceSpark(deps, {
      type: 'model-input',
      payload: {
        eventId: event.data.eventId,
        model: activeModel,
        provider: activeProvider,
        messages,
        toolChoice: runtimePolicy.toolChoice ?? null,
        supportsTools: runtimePolicy.supportsTools,
        waitForTools: runtimePolicy.waitForTools,
      },
    })

    let fullText = ''

    await deps.stream(activeModel, chatProvider, messages, {
      tools,
      supportsTools: runtimePolicy.supportsTools,
      waitForTools: runtimePolicy.waitForTools,
      toolChoice: runtimePolicy.toolChoice,
      onStreamEvent: async (streamEvent: StreamEvent) => {
        if (streamEvent.type === 'text-delta') {
          if (runtimePolicy.ignoreTextOutput || noResponse)
            return

          const nextText = `${fullText}${streamEvent.text}`
          traceSpark(deps, {
            type: 'model-output-text',
            payload: {
              eventId: event.data.id,
              text: streamEvent.text,
              accumulatedText: nextText,
            },
          })
          deps.onReactionDelta(event.data.id, streamEvent.text)
          fullText = nextText
        }

        if (streamEvent.type === 'tool-call') {
          traceSpark(deps, {
            type: 'model-output-tool-call',
            payload: {
              eventId: event.data.eventId,
              kind: 'tool-call',
              ...streamEvent,
            },
          })
        }

        if (streamEvent.type === 'tool-result') {
          traceSpark(deps, {
            type: 'tool-execution',
            payload: {
              eventId: event.data.eventId,
              kind: 'tool-result',
              ...streamEvent,
            },
          })
        }

        if (streamEvent.type === 'finish') {
          if (noResponse) {
            deps.onReactionEnd(event.data.id, '')
          }
          else {
            deps.onReactionEnd(event.data.id, fullText)
          }
        }

        if (streamEvent.type === 'error') {
          deps.onReactionEnd(event.data.id, fullText)
          throw streamEvent.error ?? new Error('Spark notify stream error')
        }
      },
    })

    const reaction = fullText.trim()
    traceSpark(deps, {
      type: 'result',
      payload: {
        eventId: event.data.eventId,
        reaction,
        commandCount: commandDrafts.length,
        noResponse,
        supportsTools: runtimePolicy.supportsTools,
        commands: commandDrafts,
        normalizedReaction: reaction,
        normalizedCommands: commandDrafts,
      },
    })

    return {
      reaction,
      commands: commandDrafts,
    } satisfies SparkNotifyResponse
  }

  async function handle(event: WebSocketEventOf<'spark:notify'>, control?: SparkNotifyResponseControl): Promise<SparkNotifyHandleResult | undefined> {
    if (event.data.urgency !== 'immediate' && deps.getPending().length > 0) {
      deps.setPending([...deps.getPending(), event])
      return undefined
    }
    if (deps.getProcessing()) {
      deps.setPending([...deps.getPending(), event])
      return undefined
    }

    deps.setProcessing(true)

    try {
      const response = await runNotifyAgent(event, control)
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
        } satisfies SparkNotifyCommandEvent))
        .filter(command => command.destinations.length > 0)

      return {
        commands,
      }
    }
    finally {
      deps.setProcessing(false)
    }
  }

  return {
    handle,
  }
}
