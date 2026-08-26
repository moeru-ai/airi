import type { LlmStreamingControlParser, LlmStreamingControlTokenDelay } from '../types'

const delayTokenPrefix = '<|DELAY '
const markerSuffix = '|>'

/**
 * Creates the parser for `<|DELAY n|>` streaming-control tokens.
 *
 * Use when:
 * - Loading the built-in performance delay control
 *
 * Expects:
 * - The token body is a finite positive number literal in seconds
 *
 * Returns:
 * - Parsed delay data with no side effects
 */
export function tokenDelay(): LlmStreamingControlParser<LlmStreamingControlTokenDelay> {
  return {
    match(special) {
      const trimmed = special.trim()
      return trimmed.startsWith(delayTokenPrefix) && trimmed.endsWith(markerSuffix)
    },
    name: 'DELAY',
    parse(special) {
      const trimmed = special.trim()
      const rawPayload = trimmed.slice(delayTokenPrefix.length, -markerSuffix.length).trim()
      if (!/^\d+(?:\.\d+)?$/.test(rawPayload)) {
        return undefined
      }

      const seconds = Number.parseFloat(rawPayload)
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return undefined
      }

      return {
        seconds,
        type: 'delay',
      }
    },
  }
}
