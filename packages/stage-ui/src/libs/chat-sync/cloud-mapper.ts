import type { ChatSessionMeta } from '../../types/chat-session'

import { errorMessageFrom } from '@moeru/std'

/**
 * Minimal shape of a chat returned by `GET /api/v1/chats`. Only the fields the
 * client actually needs for reconcile are listed; the server returns more.
 */
export interface RemoteChat {
  id: string
  type: 'private' | 'bot' | 'group' | 'channel'
  title: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateRemoteChatInput {
  id?: string
  type?: 'private' | 'bot' | 'group' | 'channel'
  title?: string
  members?: Array<{
    type: 'user' | 'character' | 'bot'
    userId?: string
    characterId?: string
  }>
}

export interface CreateCloudChatMapperOptions {
  /** Base server URL, e.g. `https://api.airi.build`. */
  serverUrl: string
  /** Resolves the bearer token at call time; returning `null` makes calls fail with a clear error. */
  getToken: () => string | null
  /**
   * Fetch implementation override for tests.
   *
   * @default globalThis.fetch
   */
  fetch?: typeof fetch
}

export interface CloudChatMapper {
  /** GET /api/v1/chats — returns the full list for the current user. */
  listChats: () => Promise<RemoteChat[]>
  /** POST /api/v1/chats — server may auto-generate id if not provided. */
  createChat: (input: CreateRemoteChatInput) => Promise<RemoteChat>
  /**
   * DELETE /api/v1/chats/:id — server soft-deletes the chat. Other devices
   * stop seeing it on next `listChats`; live ones won't get a push event in
   * v1 (no chat:deleted broadcast yet) but their local mapping persists
   * harmlessly until the user manually closes that session.
   */
  deleteChat: (chatId: string) => Promise<void>
}

interface ApiErrorBody {
  error?: string
  message?: string
}

async function readJsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json() as ApiErrorBody
      detail = body.message ?? body.error ?? detail
    }
    catch {
      // Non-JSON body — keep statusText.
    }
    throw new Error(`HTTP ${res.status}: ${detail}`)
  }
  return await res.json() as T
}

/**
 * Build a thin REST client over `/api/v1/chats` for cloud reconcile use cases.
 *
 * Use when:
 * - The session store needs to mirror local sessions to the server `chats`
 *   table (initial reconcile, creating cloud chats for new local sessions).
 *
 * Expects:
 * - `getToken()` returns a Bearer JWT issued by better-auth. 401 responses
 *   surface as `Error('HTTP 401: ...')` so the caller can decide whether to
 *   re-trigger login or just disable cloud sync this session.
 *
 * Returns:
 * - A handle exposing `listChats` and `createChat`. Both throw on non-2xx.
 */
export function createCloudChatMapper(options: CreateCloudChatMapperOptions): CloudChatMapper {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)

  function authHeaders(): Record<string, string> {
    const token = options.getToken()
    if (!token)
      throw new Error('cloud-chat-mapper: no auth token; user must be signed in')
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  // Used by both endpoints to construct absolute URLs without relying on
  // hardcoded path concat that would break if serverUrl ends with a slash.
  function endpoint(path: string): string {
    const url = new URL(options.serverUrl)
    url.pathname = url.pathname.replace(/\/+$/, '') + path
    return url.toString()
  }

  return {
    async listChats() {
      const res = await fetchImpl(endpoint('/api/v1/chats'), {
        method: 'GET',
        headers: authHeaders(),
        credentials: 'omit',
      })
      const body = await readJsonOrThrow<{ chats: RemoteChat[] }>(res)
      return body.chats
    },
    async createChat(input) {
      const res = await fetchImpl(endpoint('/api/v1/chats'), {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'omit',
        body: JSON.stringify(input),
      })
      return await readJsonOrThrow<RemoteChat>(res)
    },
    async deleteChat(chatId) {
      const res = await fetchImpl(endpoint(`/api/v1/chats/${encodeURIComponent(chatId)}`), {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'omit',
      })
      if (!res.ok) {
        let detail = res.statusText
        try {
          const body = await res.json() as ApiErrorBody
          detail = body.message ?? body.error ?? detail
        }
        catch {}
        throw new Error(`HTTP ${res.status}: ${detail}`)
      }
    },
  }
}

/**
 * Pure reconcile decision over local sessions and remote chats.
 *
 * Outcomes per session:
 * - `claim`: local session has no `cloudChatId`, but a remote chat with the
 *   same id (we adopted that convention when creating sessions before) or
 *   matching membership exists; bind to it.
 * - `create`: local session has no `cloudChatId` and no remote match; need to
 *   POST `/api/v1/chats` to mint a chat for it.
 * - `adopt`: remote chat exists with no local session at all; need to create
 *   a local session shell so future `pullMessages` can populate it.
 *
 * Use when:
 * - Login completes and the session-store wants a single deterministic plan
 *   instead of interleaving REST calls with mutations.
 *
 * Expects:
 * - `localSessions` is the full list of meta records owned by the current
 *   user. Sessions whose `userId` is `'local'` (anonymous) MUST be filtered
 *   out by the caller before reconcile — they are not cloud-eligible.
 *
 * Returns:
 * - A plan of three lists. The caller applies them in any order; `create`
 *   actions need the network, `claim` / `adopt` are pure store mutations.
 */
export interface ReconcilePlan {
  claim: Array<{ sessionId: string, cloudChatId: string }>
  create: Array<{ sessionId: string, characterId: string }>
  adopt: RemoteChat[]
}

export function reconcileLocalAndRemote(
  localSessions: ChatSessionMeta[],
  remoteChats: RemoteChat[],
): ReconcilePlan {
  const remoteById = new Map<string, RemoteChat>()
  for (const chat of remoteChats)
    remoteById.set(chat.id, chat)

  const localByCloudId = new Map<string, ChatSessionMeta>()
  for (const meta of localSessions) {
    if (meta.cloudChatId)
      localByCloudId.set(meta.cloudChatId, meta)
  }

  const claim: ReconcilePlan['claim'] = []
  const create: ReconcilePlan['create'] = []

  for (const meta of localSessions) {
    if (meta.cloudChatId) {
      // Already mapped; nothing to do unless the remote chat disappeared.
      // We keep the mapping anyway so messages do not lose their place.
      continue
    }

    // Convention from session creation: local sessionId is a nanoid the
    // server is willing to accept verbatim as the chat id when the local
    // session was created post-login. If a remote chat with the same id
    // exists we adopt it instead of double-creating.
    const remote = remoteById.get(meta.sessionId)
    if (remote) {
      claim.push({ sessionId: meta.sessionId, cloudChatId: remote.id })
      continue
    }

    create.push({ sessionId: meta.sessionId, characterId: meta.characterId })
  }

  const adopt: RemoteChat[] = []
  for (const chat of remoteChats) {
    if (localByCloudId.has(chat.id))
      continue
    if (claim.some(action => action.cloudChatId === chat.id))
      continue
    adopt.push(chat)
  }

  return { claim, create, adopt }
}

/**
 * Run `createChat` for every entry in the plan with bounded concurrency,
 * collecting successes and failures. Failures do not abort the loop — the
 * caller decides whether to retry next time.
 *
 * Use when:
 * - Applying a `ReconcilePlan.create` list against the network. Concurrency
 *   is capped to avoid stampeding the server when a user has many local
 *   sessions queued up from offline use.
 */
export async function applyCreateActions(
  mapper: CloudChatMapper,
  actions: ReconcilePlan['create'],
  options: { concurrency?: number } = {},
): Promise<Array<{ sessionId: string, cloudChatId?: string, error?: string }>> {
  const concurrency = Math.max(1, options.concurrency ?? 4)
  const results: Array<{ sessionId: string, cloudChatId?: string, error?: string }> = []

  let cursor = 0
  async function worker() {
    while (cursor < actions.length) {
      const idx = cursor
      cursor += 1
      const action = actions[idx]
      try {
        const remote = await mapper.createChat({
          // Reuse local sessionId as cloud chat id so subsequent reconciles
          // can claim instead of create — even if a different device beats
          // us to the punch.
          id: action.sessionId,
          type: 'bot',
          members: [{ type: 'character', characterId: action.characterId }],
        })
        results.push({ sessionId: action.sessionId, cloudChatId: remote.id })
      }
      catch (err) {
        results.push({ sessionId: action.sessionId, error: errorMessageFrom(err) ?? 'unknown' })
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, actions.length) }, () => worker())
  await Promise.all(workers)
  return results
}
