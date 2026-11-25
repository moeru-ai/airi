import type { LlmStreamingControlParser, LlmStreamingControlTokenAct } from '../types'

const actTokenPrefix = '<|ACT '
const markerSuffix = '|>'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Writes the `<|ACT {...}|>` token that {@link tokenAct} reads. Code that adds an action to a reply, for example the
 * emotion of an emoticon, sends the same token as the model, so the same handlers run it.
 *
 * @example
 * formatAct({ emotion: { name: 'sad', intensity: 0.5 } })
 * // => '<|ACT {"emotion":{"name":"sad","intensity":0.5}}|>'
 */
export function formatAct(payload: Record<string, unknown>): string {
  return `${actTokenPrefix}${JSON.stringify(payload)}${markerSuffix}`
}

/**
 * Creates the parser for `<|ACT {...}|>` streaming-control tokens.
 *
 * Use when:
 * - Loading the built-in performance action control
 *
 * Expects:
 * - The token body is a JSON object literal
 *
 * Returns:
 * - Parsed action data with no side effects
 */
export function tokenAct(): LlmStreamingControlParser<LlmStreamingControlTokenAct> {
  return {
    name: 'ACT',
    match(special) {
      const trimmed = special.trim()
      return trimmed.startsWith(actTokenPrefix) && trimmed.endsWith(markerSuffix)
    },
    parse(special) {
      const trimmed = special.trim()
      const rawPayload = trimmed.slice(actTokenPrefix.length, -markerSuffix.length).trim()

      let parsed: unknown
      try {
        parsed = JSON.parse(rawPayload)
      }
      catch {
        return undefined
      }

      if (!isPlainObject(parsed)) {
        return undefined
      }

      return {
        type: 'act',
        payload: parsed,
      }
    },
  }
}
