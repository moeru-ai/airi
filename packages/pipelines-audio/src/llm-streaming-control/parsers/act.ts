import type { LlmStreamingControlParser, LlmStreamingControlTokenAct } from '../types'

const actTokenPrefix = '<|ACT '
const markerSuffix = '|>'

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
    match(special) {
      const trimmed = special.trim()
      return trimmed.startsWith(actTokenPrefix) && trimmed.endsWith(markerSuffix)
    },
    name: 'ACT',
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
        payload: parsed,
        type: 'act',
      }
    },
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
