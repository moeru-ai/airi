import type { ChatSessionMeta } from '../../types/chat-session'

import { errorMessageFrom } from '@moeru/std'

import * as v from 'valibot'

const REMOTE_CHAT_TYPES = ['private', 'bot', 'group', 'channel'] as const

const RemoteChatSchema = v.object({
  createdAt: v.string(),
  id: v.pipe(v.string(), v.minLength(1)),
  title: v.nullable(v.string()),
  type: v.picklist(REMOTE_CHAT_TYPES),
  updatedAt: v.string(),
})

const ListChatsResponseSchema = v.object({
  chats: v.array(RemoteChatSchema),
})

export interface CloudChatMapper {
  /**
   * POST /api/v1/chats — server may auto-generate id if not provided. A
   * 409 Conflict (id already exists) is treated as an idempotent claim and
   * the existing remote chat is returned.
   */
  createChat: (input: CreateRemoteChatInput) => Promise<RemoteChat>
  /**
   * DELETE /api/v1/chats/:id — server soft-deletes the chat. Other devices
   * stop seeing it on next `listChats`; live ones won't get a push event in
   * v1 (no chat:deleted broadcast yet) but their local mapping persists
   * harmlessly until the user manually closes that session.
   */
  deleteChat: (chatId: string) => Promise<void>
  /** GET /api/v1/chats — returns the full list for the current user. */
  listChats: () => Promise<RemoteChat[]>
}

export interface CreateCloudChatMapperOptions {
  /**
   * Fetch implementation. Production callers MUST pass `authedFetch` from
   * `libs/auth-fetch` so 401 responses trigger the single-flight token
   * refresh + retry — matching every other REST surface in stage-ui.
   * The default is the bare `globalThis.fetch` so tests in non-DOM
   * environments (Node) don't pull `auth-fetch` (which transitively reads
   * `window.location`).
   *
   * @default globalThis.fetch
   */
  fetch?: typeof fetch
  /**
   * Per-request timeout in ms. A hung `listChats` would otherwise hold the
   * reconcile reentrance guard forever (`cloudReconcileTask` never settles).
   *
   * @default 10_000
   */
  requestTimeoutMs?: number
  /** Base server URL, e.g. `https://api.airi.build`. */
  serverUrl: string
}

export interface CreateRemoteChatInput {
  id?: string
  members?: Array<{
    characterId?: string
    type: 'bot' | 'character' | 'user'
    userId?: string
  }>
  title?: string
  type?: 'bot' | 'channel' | 'group' | 'private'
}

/**
 * Result of a reconcile decision over local sessions and remote chats.
 *
 * Outcomes per session:
 * - `claim`: local session has no `cloudChatId`, but a remote chat with the
 *   same id (we adopted that convention when creating sessions before) or
 *   matching membership exists; bind to it.
 * - `create`: local session has no `cloudChatId` and no remote match; need to
 *   POST `/api/v1/chats` to mint a chat for it.
 * - `adopt`: remote chat exists with no local session at all; need to create
 *   a local session shell so future `pullMessages` can populate it.
 */
export interface ReconcilePlan {
  adopt: RemoteChat[]
  claim: Array<{ cloudChatId: string, sessionId: string }>
  create: Array<{ characterId: string, sessionId: string }>
}

/** Minimal shape of a chat returned by `GET /api/v1/chats`. */
export type RemoteChat = v.InferOutput<typeof RemoteChatSchema>

interface ApiErrorBody {
  error?: string
  message?: string
}

/**
 * Run `createChat` for every entry in the plan in parallel, collecting
 * successes and failures. Failures do not abort the run — the caller decides
 * whether to retry next time.
 *
 * Use when:
 * - Applying a `ReconcilePlan.create` list against the network. The v1
 *   workload (a few sessions queued from offline use) is small enough that
 *   `Promise.all` is fine; a hand-rolled bounded pool would be premature.
 *
 * Expects:
 * - `mapper.createChat` handles its own 409-as-claim idempotency, so this
 *   function can treat each result as either success or terminal failure.
 *
 * Returns:
 * - One result entry per input action, in input order. Each entry has either
 *   `cloudChatId` (success) or `error` (failure with message). Never both.
 */
export async function applyCreateActions(
  mapper: CloudChatMapper,
  actions: ReconcilePlan['create'],
): Promise<Array<{ cloudChatId?: string, error?: string, sessionId: string }>> {
  return await Promise.all(actions.map(async (action) => {
    try {
      const remote = await mapper.createChat({
        // Reuse local sessionId as cloud chat id so subsequent reconciles
        // can claim instead of create — even if a different device beats
        // us to the punch.
        id: action.sessionId,
        members: [{ characterId: action.characterId, type: 'character' }],
        type: 'bot',
      })
      return { cloudChatId: remote.id, sessionId: action.sessionId }
    }
    catch (err) {
      return { error: errorMessageFrom(err) ?? 'unknown', sessionId: action.sessionId }
    }
  }))
}

/**
 * Build a thin REST client over `/api/v1/chats` for cloud reconcile use cases.
 *
 * Use when:
 * - The session store needs to mirror local sessions to the server `chats`
 *   table (initial reconcile, creating cloud chats for new local sessions).
 *
 * Expects:
 * - Auth is handled by `authedFetch` (the default `fetch` implementation),
 *   which reads `getAuthToken()` directly and refreshes on 401. 401 responses
 *   that survive the refresh cycle surface as `Error('HTTP 401: ...')`.
 *
 * Returns:
 * - A handle exposing `listChats`, `createChat` (with idempotent 409
 *   handling), and `deleteChat`. All throw on non-2xx outside the documented
 *   idempotency window.
 */
export function createCloudChatMapper(options: CreateCloudChatMapperOptions): CloudChatMapper {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000

  function endpoint(path: string): string {
    const url = new URL(options.serverUrl)
    url.pathname = url.pathname.replace(/\/+$/, '') + path
    return url.toString()
  }

  function jsonHeaders(): Record<string, string> {
    // authedFetch attaches `Authorization`; we only need to declare the body
    // content type for write methods.
    return { 'Content-Type': 'application/json' }
  }

  function timeoutSignal(): AbortSignal {
    // AbortSignal.timeout is in Node 17.3+ and every modern browser the
    // project targets (see Vue 3 / Vite baseline). No polyfill needed.
    return AbortSignal.timeout(requestTimeoutMs)
  }

  return {
    async createChat(input) {
      const res = await fetchImpl(endpoint('/api/v1/chats'), {
        body: JSON.stringify(input),
        headers: jsonHeaders(),
        method: 'POST',
        signal: timeoutSignal(),
      })
      // 409 is treated as a successful claim: a previous attempt landed on
      // the server but its response was lost in transit, so the retry should
      // not error out and it should not double-create. Re-fetch the existing
      // record so the caller still gets a `RemoteChat` shape back.
      if (res.status === 409 && input.id) {
        const allRes = await fetchImpl(endpoint('/api/v1/chats'), {
          method: 'GET',
          signal: timeoutSignal(),
        })
        const all = await readJsonOrThrow(allRes, ListChatsResponseSchema)
        const found = all.chats.find(chat => chat.id === input.id)
        if (found)
          return found
        // 409 with no matching record → server inconsistency; surface the
        // original error rather than pretending it succeeded.
      }
      return await readJsonOrThrow(res, RemoteChatSchema)
    },
    async deleteChat(chatId) {
      const res = await fetchImpl(endpoint(`/api/v1/chats/${encodeURIComponent(chatId)}`), {
        method: 'DELETE',
        signal: timeoutSignal(),
      })
      await throwOnError(res)
    },
    async listChats() {
      const res = await fetchImpl(endpoint('/api/v1/chats'), {
        method: 'GET',
        signal: timeoutSignal(),
      })
      const body = await readJsonOrThrow(res, ListChatsResponseSchema)
      return body.chats
    },
  }
}

/**
 * Pure reconcile decision over local sessions and remote chats.
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
  const claimedRemoteIds = new Set<string>()

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
      claim.push({ cloudChatId: remote.id, sessionId: meta.sessionId })
      claimedRemoteIds.add(remote.id)
      continue
    }

    create.push({ characterId: meta.characterId, sessionId: meta.sessionId })
  }

  const adopt: RemoteChat[] = []
  for (const chat of remoteChats) {
    if (localByCloudId.has(chat.id))
      continue
    if (claimedRemoteIds.has(chat.id))
      continue
    adopt.push(chat)
  }

  return { adopt, claim, create }
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json() as ApiErrorBody
    return body.message ?? body.error ?? res.statusText
  }
  catch {
    // Non-JSON body — keep statusText.
    return res.statusText
  }
}

async function readJsonOrThrow<T>(res: Response, schema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>): Promise<T> {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await readErrorDetail(res)}`)
  }
  // External boundary: validate the success shape too. A server schema drift
  // would otherwise feed a structurally broken object into `reconcileLocalAndRemote`.
  const raw: unknown = await res.json()
  return v.parse(schema, raw)
}

async function throwOnError(res: Response): Promise<void> {
  if (res.ok)
    return
  throw new Error(`HTTP ${res.status}: ${await readErrorDetail(res)}`)
}
