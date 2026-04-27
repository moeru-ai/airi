import type { MemoryAppendTurnInput, MemoryGateway } from '../../services/memory/gateway'

/**
 * Appends one chat turn into the local memory gateway without breaking the chat flow.
 *
 * Use when:
 * - The chat orchestrator wants best-effort local turn persistence
 * - Memory append failures should degrade gracefully instead of aborting the LLM turn
 *
 * Expects:
 * - `gateway.appendTurn` may reject for runtime-specific reasons
 * - Callers provide a fully populated append-turn payload
 *
 * Returns:
 * - Resolves once the append attempt completes or is downgraded after logging
 */
export async function appendMemoryTurnSafely(params: {
  gateway: MemoryGateway
  payload: MemoryAppendTurnInput
}) {
  try {
    await params.gateway.appendTurn(params.payload)
  }
  catch (error) {
    console.error('[memory-turn-write] Failed to append turn to local memory:', {
      error,
      payload: params.payload,
    })
  }
}
