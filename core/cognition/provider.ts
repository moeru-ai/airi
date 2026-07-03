/**
 * AIRI Core — Cognition Provider Interface
 *
 * The cognition provider generates plan proposals from structured context.
 *
 * IMPORTANT: Providers have NO runtime/tool access. They produce proposals only.
 * The runtime/planner remains the sole execution authority.
 *
 * This interface is intentionally minimal — it defines only what the coordinator
 * needs to request a proposal and inspect the result. Provider-specific configuration
 * is passed at construction time.
 */

import type { CancellationToken } from '../tasks/cancellation.js'
import type { CognitionRequest, CognitionResponse, ModelInfo } from './types.js'

/**
 * Cognition provider — generates plan proposals from structured context.
 *
 * IMPORTANT: Providers have NO runtime/tool access. They produce proposals only.
 * The runtime/planner remains the sole execution authority.
 */
export interface CognitionProvider {
  /**
   * Generate a plan proposal from the given request.
   *
   * @param request - The cognition request with context and constraints.
   * @param cancellationToken - Cancellation token for cooperative cancellation.
   * @returns A plan proposal with reasoning trace.
   */
  generatePlanProposal: (
    request: CognitionRequest,
    cancellationToken?: CancellationToken,
  ) => Promise<CognitionResponse>

  /**
   * Get the model information for this provider.
   */
  getModelInfo: () => ModelInfo

  /**
   * Check if the provider is available/healthy.
   */
  isAvailable: () => Promise<boolean>
}

/**
 * Options for creating a cognition provider.
 */
export interface CognitionProviderOptions {
  /** Maximum time in milliseconds to wait for a proposal. */
  /** @default 30_000 */
  readonly timeoutMs?: number

  /** Maximum number of retries on transient failures. */
  /** @default 0 */
  readonly maxRetries?: number

  /** Delay in milliseconds between retries. */
  /** @default 1_000 */
  readonly retryDelayMs?: number
}
