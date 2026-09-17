import { maxLength, nonEmpty, pipe, safeParse, string, trim } from 'valibot'

const turnIdSchema = pipe(string(), trim(), nonEmpty(), maxLength(128))

/**
 * Validates a turn ID at HTTP and WebSocket boundaries.
 * Missing or invalid IDs leave ledger entries ungrouped.
 *
 * @example
 * parseTurnId(' turn-1 ')
 * // => 'turn-1'
 */
export function parseTurnId(input: unknown): string | undefined {
  const result = safeParse(turnIdSchema, input)
  return result.success ? result.output : undefined
}
