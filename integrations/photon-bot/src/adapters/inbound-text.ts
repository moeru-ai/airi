import type { PhotonMessage } from '../photon/client'

import { maskHandle } from './reply-text'

/** The message that an inline reply or a tapback points to. */
export interface QuotedMessage {
  /** Not set when the message has no text, such as an image. */
  text?: string
  /** True when the character sent the message. */
  fromAgent: boolean
}

const QUOTE_MAX_LENGTH = 80
const SHAPE_STRING_MAX_LENGTH = 200

// NOTICE:
// Photon does not document the values of `reaction`. Its OpenAPI document says only "non-empty string".
// These are the names of the six iMessage tapbacks. Any other value goes to the character as it is.
// Remove this note when Photon documents the values.
const TAPBACKS: Record<string, string> = {
  love: '❤️',
  like: '👍',
  dislike: '👎',
  laugh: '😂',
  emphasize: '‼️',
  question: '❓',
}

/** Puts a quoted message on one line and shortens a long one. */
function quoteOf(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > QUOTE_MAX_LENGTH ? `${line.slice(0, QUOTE_MAX_LENGTH - 1).trimEnd()}…` : line
}

function describe(parent: QuotedMessage | undefined): string {
  if (!parent?.text)
    return 'a message'
  return `${parent.fromAgent ? 'your message' : 'their own message'} "${quoteOf(parent.text)}"`
}

/**
 * Writes an inline reply as plain text that quotes the message it answers.
 *
 * AIRI takes plain text only, so the quote is the only way to tell the character what the person answers.
 * Without `parent`, the text says "a message" because the bot did not find the answered message.
 *
 * @example
 * replyTextFor('yes please', { text: 'Do you want tea?', fromAgent: true })
 * // => 'Replying to your message "Do you want tea?": yes please'
 */
export function replyTextFor(text: string, parent?: QuotedMessage): string {
  return `Replying to ${describe(parent)}: ${text}`
}

/**
 * Writes a tapback as a plain sentence that quotes the message it is on.
 * Without `parent`, the sentence says "a message" because the bot did not find the message with the tapback.
 *
 * @example
 * tapbackTextFor('love', { text: 'good night', fromAgent: true })
 * // => 'Reacted ❤️ to your message "good night"'
 */
export function tapbackTextFor(reaction: string, parent?: QuotedMessage): string {
  return `Reacted ${TAPBACKS[reaction.trim().toLowerCase()] ?? reaction.trim()} to ${describe(parent)}`
}

/**
 * Returns a message as JSON for the log, so a person can compare the real shape with the code.
 *
 * Each string keeps at most 200 characters. A phone number or an email address keeps only its masked form.
 *
 * @example
 * shapeOf({ id: 'msg-1', sentBy: { id: 'u-1', handle: '+15550101234' } })
 * // => '{"id":"msg-1","sentBy":{"id":"u-1","handle":"…1234"}}'
 */
export function shapeOf(message: PhotonMessage): string {
  return JSON.stringify(message, (key, value: unknown) => {
    if (typeof value !== 'string')
      return value
    if (key === 'handle')
      return maskHandle(value)
    return value.length > SHAPE_STRING_MAX_LENGTH ? `${value.slice(0, SHAPE_STRING_MAX_LENGTH)}…` : value
  })
}
