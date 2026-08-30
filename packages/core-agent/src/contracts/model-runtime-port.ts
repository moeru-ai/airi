import type { Message, Tool } from '@xsai/shared-chat'

import type { StreamOptions } from '../types/llm'
import type { CustomModelRuntimeProtocol } from './fetch-transport-port'

/** Model discovery lifecycle reported to configuration UI. */
export type ModelDiscoveryStatus
  = | 'idle'
    | 'loading'
    | 'success'
    | 'empty'
    | 'unsupported'
    | 'failed'

/** One model returned by optional discovery. */
export interface DiscoveredModel {
  id: string
  name?: string
}

/**
 * Failure from configuration, discovery, generation, or transport.
 *
 * UI maps `stage`, `code`, and `status` to localized text. `message` is a
 * redacted diagnostic and must not include secrets.
 */
export interface ModelConnectionErrorFields {
  stage: 'config' | 'discovery' | 'generation' | 'transport'
  code:
    | 'invalid-config'
    | 'network-unreachable'
    | 'dns-failed'
    | 'tls-failed'
    | 'timeout'
    | 'unauthorized'
    | 'forbidden'
    | 'not-found'
    | 'rate-limited'
    | 'unsupported-response'
    | 'upstream-error'
    | 'browser-request-blocked'
    | 'unknown'
  message: string
  status?: number
  retryable: boolean
}

/** Result of one optional model-list request. */
export type ModelDiscoveryResult
  = | { status: 'success', models: DiscoveredModel[] }
    | { status: 'empty', models: [] }
    | { status: 'unsupported' }
    | { status: 'failed', error: ModelConnectionErrorFields }

/** Result of one generation test that uses the selected model. */
export type ModelGenerationValidationResult
  = | { success: true }
    | { success: false, error: ModelConnectionErrorFields }

/**
 * Immutable connection snapshot used by one protocol runtime.
 *
 * Callers resolve URLs and merge headers before creating the runtime.
 */
export interface ModelRuntimeConnection {
  /** Isolates one saved connection instance. */
  connectionId: string
  protocol: CustomModelRuntimeProtocol
  generationUrl: string
  /**
   * Resolved model-list URL.
   *
   * Omit this field to mark discovery as unsupported without sending a request.
   */
  modelListUrl?: string
  headers: Record<string, string>
}

/** One protocol-neutral generation request. */
export interface ModelRuntimeStreamInput {
  model: string
  messages: Message[]
  options?: StreamOptions & {
    /**
     * Maximum output tokens for this request.
     *
     * @default Anthropic Messages uses 4096 when omitted. Other protocols omit the field.
     */
    maxOutputTokens?: number
  }
  tools?: Tool[]
}

/** One generation test request. */
export interface ModelRuntimeValidationInput {
  model: string
  abortSignal?: AbortSignal
}

/**
 * Protocol-neutral model runtime used by Custom Model connections.
 *
 * Existing xsAI `ChatProvider` call sites keep {@link import('./llm-port').AgentLLMPort}.
 * A compatibility adapter implements this port by calling that chain.
 */
export interface ModelRuntimePort {
  /** Protocol selected when this runtime was created. */
  readonly protocol: CustomModelRuntimeProtocol
  /** Streams one generation and emits AIRI stream events. */
  stream: (input: ModelRuntimeStreamInput) => Promise<void>
  /**
   * Lists models from the optional model-list endpoint.
   *
   * Discovery does not decide whether the connection can generate.
   */
  discover: (input?: { abortSignal?: AbortSignal }) => Promise<ModelDiscoveryResult>
  /**
   * Sends a minimal generation request with the selected model.
   *
   * Validation and real generation must use the same adapter and transport.
   */
  validateGeneration: (input: ModelRuntimeValidationInput) => Promise<ModelGenerationValidationResult>
}
