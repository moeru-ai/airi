import type { ChatHistoryItem } from '../../types/chat'

import { extractMessageText } from '../../libs/chat-sync'

/** The characters of context that a snippet keeps before the match. The row truncates the end with CSS. */
const SNIPPET_LEAD = 16

/** The part of a message around a match, for the second line of a conversation row. */
export interface SessionSearchSnippet {
  /** The text before the match. It starts with `…` when the message has more text before it. */
  before: string
  /** The matched text, as it appears in the message. */
  match: string
  /** The text after the match. */
  after: string
  fromUser: boolean
}

/** Why a conversation matches a query. */
export interface SessionSearchMatch {
  /** The newest message that contains the query. Missing when only the title matches. */
  snippet?: SessionSearchSnippet
}

/** What the search reads from one conversation. */
export interface SessionSearchSource {
  sessionId: string
  /** The title that the row shows: the title of the conversation, else its first message. */
  title: string
  /** The messages of the conversation, oldest first. Missing when no message is on the device. */
  messages?: readonly ChatHistoryItem[]
}

/**
 * Prepares a query for comparison: trims it, joins the white space, and lowers the case.
 *
 * @example
 * normalizeSessionQuery('  Moon   Trip ')
 * // => 'moon trip'
 */
export function normalizeSessionQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function snippetOf(text: string, start: number, length: number, fromUser: boolean): SessionSearchSnippet {
  const leadStart = Math.max(0, start - SNIPPET_LEAD)
  return {
    before: `${leadStart > 0 ? '…' : ''}${text.slice(leadStart, start)}`,
    match: text.slice(start, start + length),
    after: text.slice(start + length),
    fromUser,
  }
}

/**
 * Finds the conversations that contain a query, in their title or in the text of a user or assistant message. The match
 * ignores case and white space. A conversation that matches in a message gets the newest matching message as a
 * snippet. An empty query matches nothing.
 *
 * @example
 * searchSessions('moon', [{ sessionId: 'a', title: 'Trip', messages: [{ role: 'user', content: 'To the Moon', createdAt: 1 }] }])
 * // => Map { 'a' => { snippet: { before: 'To the ', match: 'Moon', after: '', fromUser: true } } }
 */
export function searchSessions(query: string, sources: readonly SessionSearchSource[]): Map<string, SessionSearchMatch> {
  const needle = normalizeSessionQuery(query)
  const matches = new Map<string, SessionSearchMatch>()
  if (!needle)
    return matches

  for (const source of sources) {
    const snippet = newestSnippet(needle, source.messages ?? [])
    if (snippet)
      matches.set(source.sessionId, { snippet })
    else if (normalizeSessionQuery(source.title).includes(needle))
      matches.set(source.sessionId, {})
  }
  return matches
}

function newestSnippet(needle: string, messages: readonly ChatHistoryItem[]): SessionSearchSnippet | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'user' && message.role !== 'assistant')
      continue
    // The row shows one line, so the snippet joins the white space as the summary of the row does.
    const text = extractMessageText(message).replace(/\s+/g, ' ').trim()
    // Lowering the case keeps the length of these scripts, so an index in the lowered text is an index in the text.
    // A character that changes length when lowered, for example `İ`, can move the snippet by a character.
    const start = text.toLocaleLowerCase().indexOf(needle)
    if (start >= 0)
      return snippetOf(text, start, needle.length, message.role === 'user')
  }
  return undefined
}
