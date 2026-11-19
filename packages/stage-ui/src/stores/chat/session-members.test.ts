import type { ChatSessionMeta } from '../../types/chat-session'

import { describe, expect, it } from 'vitest'

import { characterMembersOfMeta } from './session-members'

function metaOf(characterId: string): ChatSessionMeta {
  return { sessionId: 'session-1', userId: 'local', characterId, createdAt: 1, updatedAt: 1 }
}

describe('characterMembersOfMeta', () => {
  it('returns the character of the session', () => {
    expect(characterMembersOfMeta(metaOf('character-1'))).toEqual(['character-1'])
  })

  it('returns no members for an unknown session', () => {
    expect(characterMembersOfMeta(undefined)).toEqual([])
  })

  it('returns no members for a session without a character', () => {
    expect(characterMembersOfMeta(metaOf(''))).toEqual([])
  })
})
