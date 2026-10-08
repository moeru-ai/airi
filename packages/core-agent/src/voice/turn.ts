/** The conversation runtime owns this identity for one response turn. */
export interface TurnRef {
  readonly sessionId: string
  readonly turnId: string
}

/** Encodes both identity fields without delimiter collisions across sessions. */
export function turnKey(turn: TurnRef): string {
  return JSON.stringify([turn.sessionId, turn.turnId])
}
