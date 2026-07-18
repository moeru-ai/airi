import type { ChatSessionMeta } from '../../types/chat-session'
import type { CloudChatMapper, RemoteChat } from './cloud-mapper'

import { describe, expect, it, vi } from 'vitest'

import { applyCreateActions, createCloudChatMapper, reconcileLocalAndRemote } from './cloud-mapper'

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

  /**
   * @example
   * A remote chat that is *both* claimed (its id matches an unmapped local
   * session) and present in the remote list must NOT also appear in adopt —
   * otherwise the same chat would be both claimed AND adopted, creating
   * duplicate local sessions for it.
   */
  it('does not double-count a chat that appears in claim and the remote list', () => {
    const plan = reconcileLocalAndRemote(
      [makeMeta({ sessionId: 'abc' })],
      [makeRemote({ id: 'abc' })],
    )
    expect(plan.claim).toEqual([{ sessionId: 'abc', cloudChatId: 'abc' }])
    expect(plan.adopt).toEqual([])
  })
})

function jsonResponse(body: unknown, init: { status?: number, statusText?: string } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: { 'Content-Type': 'application/json' },
  })
}

function emptyResponse(init: { status?: number, statusText?: string } = {}): Response {
  return new Response(null, {
    status: init.status ?? 204,
    statusText: init.statusText ?? 'No Content',
  })
}

describe('createCloudChatMapper.listChats', () => {
  /**
   * @example
   * 200 with `{ chats: [...] }` body → returns chats array.
   */
  it('returns the chats array on 2xx', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      chats: [{ id: 'a', type: 'bot', title: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
    }))
    const mapper = createCloudChatMapper({ serverUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch })
    const chats = await mapper.listChats()
    expect(chats.map(c => c.id)).toEqual(['a'])
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/chats',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  /**
   * @example
   * Server schema drift: `chats` is `null` instead of an array. Without
   * boundary validation this would feed `null.length` down into reconcile.
   */
  it('rejects malformed responses on 2xx via schema validation', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ chats: null }))
    const mapper = createCloudChatMapper({ serverUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch })
    await expect(mapper.listChats()).rejects.toThrow()
  })

  /**
   * @example
   * 401 with a JSON body → error message includes the body's `message`.
   */
  it('throws with body-derived detail on non-2xx JSON errors', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'token expired' }, { status: 401, statusText: 'Unauthorized' }))
    const mapper = createCloudChatMapper({ serverUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch })
    await expect(mapper.listChats()).rejects.toThrow(/HTTP 401: token expired/)
  })

  /**
   * @example
   * Non-2xx with non-JSON body falls back to statusText. The previous
   * implementation duplicated this logic in `deleteChat`; the unified path
   * still has to keep it working.
   */
  it('falls back to statusText when the error body is not JSON', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>oops</html>', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/html' },
    }))
    const mapper = createCloudChatMapper({ serverUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch })
    await expect(mapper.listChats()).rejects.toThrow(/HTTP 502: Bad Gateway/)
  })
})

describe('createCloudChatMapper.createChat', () => {
  /**
   * @example
   * Happy path: 201 with the created chat body.
   */
  it('returns the created chat on 2xx', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      id: 'minted',
      type: 'bot',
      title: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    }, { status: 201, statusText: 'Created' }))
    const mapper = createCloudChatMapper({ serverUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch })
    const chat = await mapper.createChat({ id: 'minted', type: 'bot' })
    expect(chat.id).toBe('minted')
  })

  /**
   * @example
   * Idempotent retry path: server returned 409 because a previous attempt
   * already landed but its response was lost in transit. The mapper
   * follows up with a listChats and returns the existing record so the
   * caller does not re-fail on a transient network blip.
   */
  it('treats 409 as a successful claim by re-fetching the existing chat', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: 'already exists' }, { status: 409, statusText: 'Conflict' }))
      .mockResolvedValueOnce(jsonResponse({
        chats: [{ id: 'minted', type: 'bot', title: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      }))
    const mapper = createCloudChatMapper({ serverUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch })
    const chat = await mapper.createChat({ id: 'minted', type: 'bot' })
    expect(chat.id).toBe('minted')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  /**
   * @example
   * 409 without an id (server auto-generates) cannot be turned into an
   * idempotent claim — there is no client-known id to look up. Surface the
   * error so the caller can retry or escalate.
   */
  it('does not attempt 409 idempotency without a client-supplied id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ message: 'conflict' }, { status: 409, statusText: 'Conflict' }))
    const mapper = createCloudChatMapper({ serverUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch })
    await expect(mapper.createChat({ type: 'bot' })).rejects.toThrow(/HTTP 409/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('createCloudChatMapper.deleteChat', () => {
  /**
   * @example
   * 204 No Content → resolves silently.
   */
  it('resolves on 2xx', async () => {
    const fetchMock = vi.fn(async () => emptyResponse())
    const mapper = createCloudChatMapper({ serverUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch })
    await expect(mapper.deleteChat('abc')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/chats/abc',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  /**
   * @example
   * Chat ids are URL-encoded so an id containing slashes or spaces does not
   * smuggle path segments past the server.
   */
  it('encodes chat ids in the path', async () => {
    const fetchMock = vi.fn(async () => emptyResponse())
    const mapper = createCloudChatMapper({ serverUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch })
    await mapper.deleteChat('a/b c')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/chats/a%2Fb%20c',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  /**
   * @example
   * 500 surfaces with the JSON body's message; non-JSON bodies fall back
   * to statusText.
   */
  it('throws on non-2xx with structured detail', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'kaboom' }, { status: 500, statusText: 'Internal' }))
    const mapper = createCloudChatMapper({ serverUrl: 'https://api.example.com', fetch: fetchMock as unknown as typeof fetch })
    await expect(mapper.deleteChat('abc')).rejects.toThrow(/HTTP 500: kaboom/)
  })
})

describe('applyCreateActions', () => {
  /**
   * @example
   * All actions succeed; results carry cloudChatId.
   */
  it('returns one cloudChatId entry per successful create', async () => {
    const mapper: CloudChatMapper = {
      listChats: async () => [],
      createChat: async input => ({ id: input.id!, type: 'bot', title: null, createdAt: '', updatedAt: '' }),
      deleteChat: async () => {},
    }
    const results = await applyCreateActions(mapper, [
      { sessionId: 's1', characterId: 'c1' },
      { sessionId: 's2', characterId: 'c2' },
    ])
    expect(results).toEqual([
      { sessionId: 's1', cloudChatId: 's1' },
      { sessionId: 's2', cloudChatId: 's2' },
    ])
  })

  /**
   * @example
   * Partial failure: one createChat throws, the rest succeed. The error
   * entry carries `error` instead of `cloudChatId`; failures do not abort
   * the run.
   */
  it('records partial failures without aborting the run', async () => {
    const mapper: CloudChatMapper = {
      listChats: async () => [],
      createChat: async (input) => {
        if (input.id === 's2')
          throw new Error('boom')
        return { id: input.id!, type: 'bot', title: null, createdAt: '', updatedAt: '' }
      },
      deleteChat: async () => {},
    }
    const results = await applyCreateActions(mapper, [
      { sessionId: 's1', characterId: 'c1' },
      { sessionId: 's2', characterId: 'c2' },
      { sessionId: 's3', characterId: 'c3' },
    ])
    expect(results).toEqual([
      { sessionId: 's1', cloudChatId: 's1' },
      { sessionId: 's2', error: 'boom' },
      { sessionId: 's3', cloudChatId: 's3' },
    ])
  })

  /**
   * @example
   * Empty actions list → empty results, no createChat calls.
   */
  it('returns an empty array on empty input', async () => {
    const createChat = vi.fn()
    const mapper: CloudChatMapper = {
      listChats: async () => [],
      createChat: createChat as unknown as CloudChatMapper['createChat'],
      deleteChat: async () => {},
    }
    expect(await applyCreateActions(mapper, [])).toEqual([])
    expect(createChat).not.toHaveBeenCalled()
  })
})
