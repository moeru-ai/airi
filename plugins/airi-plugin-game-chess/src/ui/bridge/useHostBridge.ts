import type { GameletAiTurnRequest } from '@proj-airi/plugin-sdk-tamagotchi/widgets'

import type { EngineReview } from '../engine/useEngineReview'
import type { BridgeCommand } from './hostBridge'

import { onScopeDispose } from 'vue'

import * as v from 'valibot'

import { createEventaTransport } from './eventaTransport'
import { createHostBridge } from './hostBridge'

/** Arguments of the `analyze_position` tool command, mirroring `chessTools.ts`. */
const analyzePositionCommand = v.object({
  fen: v.string(),
  depth: v.optional(v.number()),
  multipv: v.optional(v.number()),
})

/** Arguments of the `explain_move` tool command, mirroring `chessTools.ts`. */
const explainMoveCommand = v.object({
  fenBefore: v.string(),
  moveUci: v.string(),
})

/**
 * Runs one host-forwarded tool command against the gamelet engine.
 *
 * The result is spread into a plain record so it survives the structured-clone
 * `postMessage` hop back to the host.
 */
async function dispatchEngineCommand(engine: EngineReview, command: BridgeCommand): Promise<Record<string, unknown>> {
  switch (command.type) {
    case 'analyze_position': {
      const { fen, depth, multipv } = v.parse(analyzePositionCommand, command)
      return { ...await engine.analyzePosition(fen, depth, multipv) } as Record<string, unknown>
    }
    case 'explain_move': {
      const { fenBefore, moveUci } = v.parse(explainMoveCommand, command)
      return { ...await engine.explainMove(fenBefore, moveUci) } as Record<string, unknown>
    }
    default:
      throw new Error(`Unknown gamelet command type: "${command.type}".`)
  }
}

/** Reactive view returned by {@link useHostBridge}. */
export interface HostBridgeView {
  /** Asks the host to run one AI coach turn from a fully-formed request. */
  requestAiTurn: (request: GameletAiTurnRequest) => void
}

/**
 * Connects the gamelet to the AIRI host over the iframe bridge.
 *
 * Use when:
 * - The board component is ready to forward AI turn requests to the host and
 *   answer host-forwarded chess tools
 *
 * Expects:
 * - Called from a component setup; binds teardown to `onScopeDispose`
 * - `engine` is the same {@link EngineReview} the board uses
 *
 * Returns:
 * - A {@link HostBridgeView}. The caller decides which game events warrant a
 *   coach turn (via `coachTurnFor`) so it can also vary verbosity, track which
 *   move is being narrated, etc. — the bridge stays unaware of teaching policy.
 */
export function useHostBridge(engine: EngineReview): HostBridgeView {
  const bridge = createHostBridge(createEventaTransport(), {
    onCommand: command => dispatchEngineCommand(engine, command),
  })

  onScopeDispose(() => bridge.dispose())

  return {
    requestAiTurn: bridge.requestAiTurn,
  }
}
