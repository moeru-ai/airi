import type { SendOutcome } from '@proj-airi/stage-ui/types/chat'

import { errorMessageFrom } from '@moeru/std'

/**
 * Inputs the shared composer-send policy needs from each surface. The surface
 * owns the transport (direct `ingest` vs the tamagotchi chat-sync relay) and
 * how it presents a rescued draft / a failure; the policy owns when to do each.
 */
export interface ComposerSendParams {
  /**
   * Runs the actual send and resolves with the structured outcome. Resolves
   * (never rejects) for a stop/cancel (`rolledBack`) or a stream/hook failure
   * (`error`); a rejection therefore means the turn never reached history.
   */
  send: () => Promise<SendOutcome | undefined>
  /**
   * Puts the optimistically-cleared draft back into the composer. Each surface
   * decides how (lossless rejoin, parked chip, restored attachments); the
   * policy only decides whether to call it.
   */
  restoreDraft: () => void
  /**
   * Surfaces a failure message to the user (typically an error row). `source`
   * distinguishes a resolved `outcome.error` (the orchestrator/relay produced a
   * structured failure, so an authority window may already own a durable,
   * broadcast row) from a thrown rejection (the relay/authority was unreachable,
   * so the surface must record the row itself). Surfaces that own their store
   * directly can ignore `source` and always append.
   */
  appendErrorRow: (message: string, source: 'outcome' | 'thrown') => void
}

/**
 * Shared composer-send policy for every chat surface.
 *
 * Use when:
 * - A composer optimistically cleared its draft and now needs to react to the
 *   send's structured {@link SendOutcome} uniformly across surfaces.
 *
 * Expects:
 * - `send` follows the resolved-outcome contract: a stop/cancel resolves
 *   `rolledBack`, a stream/hook failure resolves `error` (with
 *   `turnCommitted`), and only a pre-append failure (provider resolution,
 *   relay timeout, programmer error) rejects.
 *
 * Returns:
 * - Resolves once the outcome has been handled. Never rejects: `send`
 *   rejections are caught and surfaced as an error row plus a draft restore.
 */
export async function runComposerSend(params: ComposerSendParams): Promise<void> {
  const { send, restoreDraft, appendErrorRow } = params

  try {
    const outcome = await send()

    // Nothing landed in history (a rescuable send stopped before any output, or
    // a queued send was cancelled / discarded as stale before it ran): put the
    // text back instead of losing it.
    if (outcome?.rolledBack) {
      restoreDraft()
      return
    }

    // A stream/hook failure that still resolved (the contract resolves rather
    // than rejects so the failure survives the tamagotchi BroadcastChannel
    // relay). A committed turn keeps its text in the transcript, so only restore
    // the draft when the turn never landed.
    if (outcome?.error) {
      appendErrorRow(outcome.error.message, 'outcome')
      if (!outcome.error.turnCommitted)
        restoreDraft()
    }
  }
  catch (error) {
    // INVARIANT: with the resolved-outcome contract, anything that THROWS
    // happened BEFORE the user turn was appended (provider resolution, relay
    // timeout, or a programmer error), so the turn is never in history. An
    // unconditional restore therefore cannot duplicate a committed turn.
    restoreDraft()
    appendErrorRow(errorMessageFrom(error) ?? 'Failed to send message', 'thrown')
  }
}
