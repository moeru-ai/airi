import type { ToolChoice } from '@xsai/shared-chat'

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
   * Additional serialized sections appended after the default user payload serialization.
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
   * Replaces the default JSON user payload serialization entirely for one run.
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
export interface SparkTraceEvent {
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
export interface SparkNotifyTracingHooks {
  /** Optional sink that receives ordered trace events from the notify runtime. */
  onTrace?: (event: SparkTraceEvent) => void
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
