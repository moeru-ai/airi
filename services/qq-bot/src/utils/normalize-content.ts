interface StructuredContentPart {
  type?: string
  text?: string
  refusal?: string
}

/**
 * Normalizes AIRI structured content into plain text.
 *
 * Use when:
 * - Handling `message.content` from AIRI chat output events
 * - The upstream payload may be a string or structured parts array
 *
 * Expects:
 * - Any unknown value coming from runtime event payloads
 *
 * Returns:
 * - A best-effort plain string representation
 */
export function normalizeContent(content: unknown): string {
  if (typeof content === 'string')
    return content

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object')
          return ''

        const candidate = part as StructuredContentPart
        return candidate.text ?? candidate.refusal ?? ''
      })
      .join('')
  }

  if (content == null)
    return ''

  return String(content)
}
