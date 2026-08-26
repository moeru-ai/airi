import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, CompletionToolCall, CompletionToolResult, Message, Tool, ToolChoice } from '@xsai/shared-chat'

export type BuiltinToolsResolver = (model: string, chatProvider: ChatProvider) => Promise<Tool[]>

/** Provider-safe token usage emitted after one complete streamed generation. */
export interface LlmUsage {
  inputTokens?: number
  outputTokens?: number
  source: LlmUsageSource
  totalTokens?: number
}

/** Describes whether generation usage came from the provider or a local fallback. */
export type LlmUsageSource = 'estimated' | 'reported' | 'unavailable'

export type StreamEvent
  = | (any & { type: 'finish' })
    | (CompletionToolCall & { type: 'tool-call' })
    | (CompletionToolResult & { isError: true, type: 'tool-error' })
    | { error: any, type: 'error' }
    | { result?: CommonContentPart[] | string, toolCallId: string, type: 'tool-result' }
    | { text: string, type: 'reasoning-delta' }
    | { text: string, type: 'text-delta' }

export interface StreamFromOptions {
  builtinToolsResolver?: BuiltinToolsResolver
  chatProvider: ChatProvider
  messages: Message[]
  model: string
  options?: StreamOptions
}

export interface StreamOptions {
  abortSignal?: AbortSignal
  /**
   * Per-model runtime cache of whether the provider accepts content-part arrays
   * (e.g. `[{type:'text',...},{type:'image_url',...}]`) for `messages[].content`.
   *
   * Some OpenAI-compatible providers (notably Rust/serde-strict gateways) only
   * deserialize `content` as a plain string and reject arrays with HTTP 400
   * `Failed to deserialize the JSON body into the target type: messages[N]:
   * invalid type: sequence, expected a string`. When a stream surfaces such an
   * error we set the entry to `false` for the model key and force-flatten on
   * the next attempt.
   *
   * Mirrors {@link toolsCompatibility} for the tool-calling capability.
   *
   * See: https://github.com/moeru-ai/airi/issues/1500
   */
  contentArrayCompatibility?: Map<string, boolean>
  headers?: Record<string, string>
  /** Called once with the final xsAI message list after all tool rounds finish. */
  onMessages?: (messages: Message[]) => Promise<void> | void
  onStreamEvent?: (event: StreamEvent) => Promise<void> | void
  /** Called once after the full stream, including tool rounds, has settled. */
  onUsage?: (usage: LlmUsage) => Promise<void> | void
  /** Internal correlation kept out of the provider request body. */
  requestCorrelation?: {
    conversationId: string
    roundId: string
  }
  supportsContentArray?: boolean
  supportsTools?: boolean
  /** Provider tool-selection directive for one request. */
  toolChoice?: ToolChoice
  tools?: (() => Promise<Tool[] | undefined>) | Tool[]
  toolsCompatibility?: Map<string, boolean>
  waitForTools?: boolean
}
