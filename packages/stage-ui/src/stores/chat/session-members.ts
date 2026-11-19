import type { ChatSessionMeta } from '../../types/chat-session'

const noMembers: readonly string[] = Object.freeze([])

/**
 * Returns the ids of the characters that are members of a session.
 *
 * The session store exposes this function as `characterMembersOf(sessionId)`.
 * Code outside the session store and chat synchronization calls that method and does not read `meta.characterId`.
 * A session holds one character today, so the list has one entry at most.
 * A group chat changes only the body of this function.
 * See `docs/ai/adr/2026-10-09-character-as-chat-member.md`.
 *
 * The list is empty for an unknown session and for a session without a character.
 */
export function characterMembersOfMeta(meta: ChatSessionMeta | undefined): readonly string[] {
  return meta?.characterId ? [meta.characterId] : noMembers
}
