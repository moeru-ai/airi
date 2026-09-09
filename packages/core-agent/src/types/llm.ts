import type { GenerationProvider } from '@proj-airi/provider-inference'
import type { CommonContentPart, CompletionToolCall, Tool, ToolChoice } from '@xsai/shared-chat'

import type { AssistantTurn, Conversation } from '../messages/types'

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
    | { type: 'finish' }
    | ({ type: 'tool-call' } & CompletionToolCall)
    | { type: 'tool-error', toolCallId: string, result?: string | CommonContentPart[], isError: true }
    | { type: 'tool-result', toolCallId: string, result?: string | CommonContentPart[] }
    | { type: 'citations', citations: import('../messages/types').Citation[] }
    | { type: 'search', id: string, status: 'in_progress' | 'searching' | 'completed' | 'failed' }
    | { type: 'error', error: unknown }

/** Options shared by generation adapters. SDK payloads stay inside each adapter. */
export interface StreamOptions {
  /** Provider registry identity used to isolate native continuation data. */
  providerId?: string
  /** Called once with this turn only, after every tool step has settled. */
  onTranscript?: (turn: AssistantTurn) => void | Promise<void>
  abortSignal?: AbortSignal
  headers?: Record<string, string>
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  /** Called once after the full stream, including tool rounds, has settled. */
  onUsage?: (usage: LlmUsage) => void | Promise<void>
  /** Internal correlation kept out of the provider request body. */
  requestCorrelation?: {
    conversationId: string
    turnId: string
    runId?: string
  }
  /**
   * The temperature parameter controls the randomness of the model's output.
   * A lower value results in more deterministic and focused output, while a
   * higher value increases creativity and diversity.
   */
  temperature?: number
  /**
   * The top_p parameter controls nucleus sampling. A value of 0.1 means only
   * the tokens comprising the top 10% probability mass are considered.
   */
  topP?: number
  toolsCompatibility?: Map<string, boolean>
  supportsTools?: boolean
  waitForTools?: boolean
  /** Provider tool-selection directive for one request. */
  toolChoice?: ToolChoice
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

export type BuiltinToolsResolver = (model: string, chatProvider: GenerationProvider) => Promise<Tool[]>

export interface StreamFromOptions {
  model: string
  chatProvider: GenerationProvider
  conversation: Conversation
  options?: StreamOptions
  builtinToolsResolver?: BuiltinToolsResolver
}
