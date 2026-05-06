import type { ChatSessionMeta } from '../../types/chat-session'
import type { RemoteChat } from './cloud-mapper'

import { describe, expect, it } from 'vitest'

import { reconcileLocalAndRemote } from './cloud-mapper'

function makeMeta(partial: Partial<ChatSessionMeta>): ChatSessionMeta {
  return {
    sessionId: partial.sessionId ?? 'session-x',
    userId: partial.userId ?? 'user-1',
    characterId: partial.characterId ?? 'char-1',
    createdAt: partial.createdAt ?? 0,
    updatedAt: partial.updatedAt ?? 0,
    ...partial,
  }
}

function makeRemote(partial: Partial<RemoteChat>): RemoteChat {
  return {
    id: partial.id ?? 'chat-1',
    type: partial.type ?? 'bot',
    title: partial.title ?? null,
    createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-01-01T00:00:00.000Z',
  }
}

describe('reconcileLocalAndRemote', () => {
  /**
   * @example
   * Local has session "abc" with no cloudChatId; remote has chat "abc".
   * Expected: claim binds them; create / adopt are empty.
   */
  it('claims a remote chat with the same id as an unmapped local session', () => {
    const plan = reconcileLocalAndRemote(
      [makeMeta({ sessionId: 'abc' })],
      [makeRemote({ id: 'abc' })],
    )
    expect(plan.claim).toEqual([{ sessionId: 'abc', cloudChatId: 'abc' }])
    expect(plan.create).toEqual([])
    expect(plan.adopt).toEqual([])
  })

  /**
   * @example
   * Local session "abc" with no cloudChatId, no remote chat.
   * Expected: create one POST per session, with characterId carried through.
   */
  it('schedules a create when no remote match exists for an unmapped local session', () => {
    const plan = reconcileLocalAndRemote(
      [makeMeta({ sessionId: 'abc', characterId: 'char-42' })],
      [],
    )
    expect(plan.claim).toEqual([])
    expect(plan.create).toEqual([{ sessionId: 'abc', characterId: 'char-42' }])
    expect(plan.adopt).toEqual([])
  })

  /**
   * @example
   * Remote chat "xyz" exists, local has nothing.
   * Expected: adopt list contains it.
   */
  it('adopts remote chats that have no local mapping', () => {
    const remote = makeRemote({ id: 'xyz' })
    const plan = reconcileLocalAndRemote([], [remote])
    expect(plan.adopt).toEqual([remote])
    expect(plan.claim).toEqual([])
    expect(plan.create).toEqual([])
  })

  /**
   * @example
   * Local already has cloudChatId === remote.id; nothing to do.
   */
  it('skips already-mapped sessions on both sides', () => {
    const plan = reconcileLocalAndRemote(
      [makeMeta({ sessionId: 'abc', cloudChatId: 'abc' })],
      [makeRemote({ id: 'abc' })],
    )
    expect(plan.claim).toEqual([])
    expect(plan.create).toEqual([])
    expect(plan.adopt).toEqual([])
  })

  /**
   * @example
   * Mixed: one to claim, one to create, one to adopt — all in one pass.
   */
  it('handles mixed claim / create / adopt in a single plan', () => {
    const plan = reconcileLocalAndRemote(
      [
        makeMeta({ sessionId: 's1' }), // matches remote r1 → claim
        makeMeta({ sessionId: 's2', characterId: 'c2' }), // no remote → create
      ],
      [
        makeRemote({ id: 's1' }),
        makeRemote({ id: 'r3' }), // no local → adopt
      ],
    )
    expect(plan.claim).toEqual([{ sessionId: 's1', cloudChatId: 's1' }])
    expect(plan.create).toEqual([{ sessionId: 's2', characterId: 'c2' }])
    expect(plan.adopt.map(r => r.id)).toEqual(['r3'])
  })

  /**
   * @example
   * Local has cloudChatId pointing at remote that disappeared (server-side
   * deletion). The local mapping is preserved instead of being silently
   * dropped — the user keeps reading their own messages locally.
   */
  it('keeps stale cloud mapping when the remote chat is gone', () => {
    const plan = reconcileLocalAndRemote(
      [makeMeta({ sessionId: 'abc', cloudChatId: 'gone' })],
      [],
    )
    expect(plan.claim).toEqual([])
    expect(plan.create).toEqual([])
    expect(plan.adopt).toEqual([])
  })
})
