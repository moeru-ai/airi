import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, CompletionToolCall, CompletionToolResult, Message, Tool } from '@xsai/shared-chat'

/** Describes whether generation usage came from the provider or a local fallback. */
export type LlmUsageSource = 'reported' | 'estimated' | 'unavailable'

/** Provider-safe token usage emitted after one complete streamed generation. */
export interface LlmUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  source: LlmUsageSource
}

export type StreamEvent
  = | { type: 'text-delta', text: string }
    | { type: 'reasoning-delta', text: string }
    | ({ type: 'finish' } & any)
    | ({ type: 'tool-call' } & CompletionToolCall)
    | (CompletionToolResult & { type: 'tool-error' })
    | { type: 'tool-result', toolCallId: string, result?: string | CommonContentPart[] }
    | { type: 'error', error: any }

export interface StreamOptions {
  abortSignal?: AbortSignal
  headers?: Record<string, string>
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  /** Called once after the full stream, including tool rounds, has settled. */
  onUsage?: (usage: LlmUsage) => void | Promise<void>
  /** Internal correlation kept out of the provider request body. */
  requestCorrelation?: {
    conversationId: string
    roundId: string
  }
  toolsCompatibility?: Map<string, boolean>
  supportsTools?: boolean
  waitForTools?: boolean
  captureToolErrors?: boolean
  tools?: Tool[] | (() => Promise<Tool[] | undefined>)
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
  supportsContentArray?: boolean
}

export type BuiltinToolsResolver = (model: string, chatProvider: ChatProvider) => Promise<Tool[]>

export interface StreamFromOptions {
  model: string
  chatProvider: ChatProvider
  messages: Message[]
  options?: StreamOptions
  builtinToolsResolver?: BuiltinToolsResolver
}
