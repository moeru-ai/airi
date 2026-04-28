/**
 * Normalizes a tool result into readable text for compact chat UI.
 *
 * Before:
 * - { ok: true, mode: "focus" }
 * - "Tool call error for \"play_chess\": failed"
 *
 * After:
 * - "{\n  \"ok\": true,\n  \"mode\": \"focus\"\n}"
 * - "Tool call error for \"play_chess\": failed"
 */
export function normalizeToolResultText(result: unknown): string {
  if (result == null) {
    return ''
  }

  if (typeof result === 'string') {
    return result.trim()
  }

  try {
    return JSON.stringify(result, null, 2).trim()
  }
  catch {
    return String(result).trim()
  }
}

/**
 * Creates a displayable `Error` from a failed tool result.
 *
 * Use when:
 * - A tool call block needs to reuse the shared copyable error panel
 *
 * Expects:
 * - Tool failures may arrive as strings or structured values
 *
 * Returns:
 * - `Error` when there is readable text, otherwise `undefined`
 */
export function createToolResultError(result: unknown): Error | undefined {
  const message = normalizeToolResultText(result)
  if (!message) {
    return undefined
  }

  return new Error(message)
}
