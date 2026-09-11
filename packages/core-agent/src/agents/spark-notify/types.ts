import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, Tool, ToolChoice } from '@xsai/shared-chat'

import type { StreamEvent } from '../../types/llm'
import type { SparkNotifyCommandDraft } from './tools'

/**
 * Runtime-only prompt hints used to reshape how one spark event is serialized for the model.
 *
 * These overrides are intentionally kept out of transport protocol types.
 * They are host-local rendering hints, not part of the canonical spark event payload.
 */
export interface SparkNotifyMessageOverride {
  /**
   * Additional system instructions appended after the base spark-notify instruction block.
   *
   * @default []
   */
  appendSystemInstructions?: string[]
  /**
   * Additional serialized sections appended after the base or replacement user payload.
   *
   * Use when:
   * - A host wants to inject a pre-rendered message fragment for one run
   * - A plugin temporarily needs extra readable context without changing the protocol schema
   *
   * Expects:
   * - Entries already serialized into provider-safe text
   *
   * @default []
   */
  appendUserSections?: string[]
  /**
   * Replaces the default JSON user payload for one run while preserving appended sections.
   *
   * @default undefined
   */
  replaceUserMessage?: string
}

/**
 * Caller-provided overrides that shape how the `spark:notify` runtime must respond.
 */
export interface SparkNotifyResponseControl {
  /**
   * Forces the runtime to produce some output instead of choosing the no-response tool.
   *
   * Use when:
   * - The host requires a visible or actionable outcome for the notify event
   *
   * Expects:
   * - Text output and spark-command tool calls are both still allowed
   *
   * @default false
   */
  forceResponse?: boolean
  /**
   * Forces a text reaction and disables spark-command tool use for the current notify event.
   *
   * Use when:
   * - The host wants a spoken or visible reaction only
   * - Tool execution would be unsafe or unnecessary for this run
   *
   * Expects:
   * - This takes precedence over `forceSparkCommandResponse` when both are set
   *
   * @default false
   */
  forceTextResponse?: boolean
  /**
   * Forces a spark-command tool response and suppresses free-form text output for the current notify event.
   *
   * Use when:
   * - The host needs the notify run to emit downstream commands only
   * - Reaction text should not leak into the user-visible channel
   *
   * Expects:
   * - The runtime exposes tools and waits for tool execution before completing
   *
   * @default false
   */
  forceSparkCommandResponse?: boolean
  /**
   * Host-local message serialization override applied only while rendering the current notify turn.
   *
   * @default undefined
   */
  messageOverride?: SparkNotifyMessageOverride
}

/**
 * Trace event emitted by the spark-notify runtime.
 */
export interface SparkNotifyRuntimeEvent {
  /** Trace event category describing which stage of the notify run emitted the payload. */
  type:
    | 'messages-rendered'
    | 'tools-prepared'
    | 'model-input'
    | 'model-output-text'
    | 'model-output-tool-call'
    | 'tool-execution'
    | 'result'
  /** JSON-serializable trace payload attached to the selected trace event category. */
  payload: Record<string, unknown>
}

/**
 * Optional tracing hooks for spark-notify runtime integrations.
 */
export interface SparkNotifySelectedChat {
  /** Provider identifier used for telemetry and diagnostics. */
  providerId: string
  /** Model identifier selected by the host. */
  model: string
  /** Resolved chat provider used for this notify run. */
  provider: ChatProvider
}

/** One fully resolved Spark Notify turn. */
export interface SparkNotifyTurn {
  /** Source protocol event that the agent must handle. */
  event: WebSocketEventOf<'spark:notify'>
  /** Host-selected model and provider for this execution. */
  selectedChat: SparkNotifySelectedChat
  /** Host-owned system prompt for this character. */
  systemPrompt: string
  /** Runtime-only response controls for this turn. */
  control?: SparkNotifyResponseControl
  /** Resolved tool and response policy for this turn. */
  policy: SparkNotifyRuntimePolicy
}

/** Completed request passed to the host-owned selected-chat runner. */
export interface SparkNotifyRunRequest {
  /** Resolved model and provider for this run. */
  selectedChat: SparkNotifySelectedChat
  /** Provider-ready messages produced by the agent and its plugins. */
  messages: Message[]
  /** Tools exposed for this one model call. */
  tools: Tool[]
  /** Tool handling policy for this run. */
  policy: Pick<SparkNotifyRuntimePolicy, 'supportsTools' | 'toolChoice' | 'waitForTools'>
  /** Normalized provider stream events. */
  onStreamEvent: (event: StreamEvent) => void | Promise<void>
}

/** Host boundary that runs a selected chat model. */
export interface SparkNotifyRunner {
  /** Runs the provider stream for one fully prepared Spark Notify turn. */
  run: (request: SparkNotifyRunRequest) => Promise<void>
}

/** Per-turn result emitted by a Spark Notify plugin. */
export interface SparkNotifyPluginResult {
  /** Command drafts collected by a plugin tool. */
  commands?: SparkNotifyCommandDraft[]
  /** Whether a plugin selected the no-response path. */
  noResponse?: boolean
}

/** Per-turn hooks returned by a Spark Notify plugin. */
export interface SparkNotifyPluginSession {
  /** Additional system instruction blocks appended in plugin order. */
  systemInstructions?: string[]
  /** Additional user-message blocks appended in plugin order. */
  userSections?: string[]
  /** Tools that this plugin exposes for the turn. */
  tools?: Tool[]
  /** Receives ordered runtime events for this one turn. */
  onEvent?: (event: SparkNotifyRuntimeEvent) => void | Promise<void>
  /** Reads the plugin result after tool execution and stream completion. */
  getResult?: () => SparkNotifyPluginResult
  /** Reads runtime events emitted by tool callbacks during the provider run. */
  getPendingEvents?: () => SparkNotifyRuntimeEvent[]
}

/** Composable capability that contributes behavior to one Spark Notify turn. */
export interface SparkNotifyPlugin {
  /** Stable identifier used for diagnostics and plugin ordering. */
  name: string
  /** Creates isolated turn state, tools, and observers for one notify event. */
  prepare: (turn: SparkNotifyTurn) => SparkNotifyPluginSession | Promise<SparkNotifyPluginSession | undefined> | undefined
}

/**
 * Resolved runtime response policy derived from `SparkNotifyResponseControl`.
 */
export interface SparkNotifyRuntimePolicy {
  /** Whether the `builtIn_sparkNoResponse` tool is exposed for the current run. */
  allowNoResponse: boolean
  /** Whether the `builtIn_sparkCommand` tool is exposed for the current run. */
  allowSparkCommand: boolean
  /** Whether the provider call should include any tools at all. */
  supportsTools: boolean
  /** Whether the runtime should wait for tool execution before treating the call as complete. */
  waitForTools: boolean
  /** Explicit tool-choice directive forwarded to the provider, when command emission is mandatory. */
  toolChoice?: ToolChoice
  /** Whether free-form text deltas should be ignored after rendering the provider response. */
  ignoreTextOutput: boolean
}
