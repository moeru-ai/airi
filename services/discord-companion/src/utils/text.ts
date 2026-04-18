/**
 * Splits a long string into Discord-friendly chunks (each <= `maxLength`).
 *
 * Use when:
 * - Sending AIRI responses that may exceed Discord's 2000 character message limit.
 *
 * Expects:
 * - `maxLength` > 0.
 *
 * Returns:
 * - An array of strings, each <= `maxLength`, split on newline or whitespace when possible.
 *
 * Before:
 * - "Very long message without break .................. (e.g. 3500 chars)"
 *
 * After:
 * - ["... first 2000 chars ended on last newline/space ...", "... remaining ..."]
 */
export function splitForDiscord(content: string, maxLength = 2000): string[] {
  if (maxLength <= 0) {
    throw new Error('maxLength must be positive')
  }

  if (content.length <= maxLength) {
    return content.length === 0 ? [] : [content]
  }

  const chunks: string[] = []
  let remaining = content

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }

    let chunkSize = maxLength
    const lastNewline = remaining.lastIndexOf('\n', maxLength)

    if (lastNewline > 0) {
      chunkSize = lastNewline
    }
    else {
      const lastSpace = remaining.lastIndexOf(' ', maxLength)
      if (lastSpace > 0) {
        chunkSize = lastSpace
      }
    }

    chunks.push(remaining.slice(0, chunkSize))
    remaining = remaining.slice(chunkSize).trimStart()
  }

  return chunks
}

/**
 * Strips Discord user mentions (`<@id>` and `<@!id>`) from a message string and trims it.
 *
 * Use when:
 * - Converting a raw Discord message to a clean textual input for the AIRI pipeline.
 *
 * Before:
 * - "<@123456789> hi <@!987654321>  how are you?"
 *
 * After:
 * - "hi   how are you?"
 */
export function stripDiscordMentions(raw: string): string {
  return raw.replace(/<@!?\d+>/g, '').trim()
}
