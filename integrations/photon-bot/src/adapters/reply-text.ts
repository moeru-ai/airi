function textOf(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (Array.isArray(content))
    return content.map(part => typeof part === 'string' ? part : (part as { text?: string }).text ?? '').join('')
  return ''
}

/**
 * Matches the stage control tokens in a reply, such as `<|ACT {"emotion":"happy"}|>` and `<|DELAY 1|>`.
 * Some models drop the leading pipe and write `<ACT {...}|>`, which the stage does not parse, so both forms match.
 */
const CONTROL_TOKEN = /<\|?\s*[A-Z]+\b[^<>]*?\|>/g

/**
 * Reads the text of the character from an `output:gen-ai:chat:message` message, without stage control tokens.
 *
 * The stage puts the text in `content`, or leaves `content` empty and puts it in `categorization.speech`.
 * Returns an empty string when the message has no text.
 *
 * @example
 * replyTextOf({ content: '', categorization: { speech: '<|ACT {"emotion":"happy"}|> Hello!' } })
 * // => 'Hello!'
 */
export function replyTextOf(message: unknown): string {
  if (typeof message !== 'object' || message === null)
    return ''
  const { content, categorization } = message as { content?: unknown, categorization?: { speech?: unknown } }
  const raw = textOf(content) || (typeof categorization?.speech === 'string' ? categorization.speech : '')
  return raw
    .replace(CONTROL_TOKEN, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Shortens a phone number or email handle for the message prefix that the character and the AIRI chat window show.
 * A phone number keeps its last four digits. An email keeps its first character and its domain.
 *
 * @example
 * maskHandle('+15550101234')
 * // => '…1234'
 * maskHandle('user@example.com')
 * // => 'u…@example.com'
 */
export function maskHandle(handle: string): string {
  const at = handle.indexOf('@')
  if (at > 0)
    return `${handle[0]}…${handle.slice(at)}`
  const digits = handle.replace(/\D/g, '')
  return digits.length > 4 ? `…${digits.slice(-4)}` : handle
}
