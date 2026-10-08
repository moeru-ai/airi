import type { Session, User } from 'better-auth'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { CHARACTER_CARD_SYNC_FLAG } from '../../libs/feature-flags'
import { useAuthStore } from '../auth'
import { useFeatureFlagsStore } from '../feature-flags'
import { useAiriCardStore } from './airi-card'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale: { value: 'en' }, t: (key: string) => key }),
}))

const runtimes: SyncedPiniaRuntime[] = []
const piniaInstances: ReturnType<typeof createPinia>[] = []

function createContext(runtime: SyncedPiniaRuntime) {
  const pinia = createPinia()
  runtimes.push(runtime)
  pinia.use(runtime.plugin)
  createApp({}).use(pinia).use(PiniaColada)
  setActivePinia(pinia)
  piniaInstances.push(pinia)
  // Cloud sync is off by default. Most of these tests exercise the sync
  // itself, so turn it on for this window the same way a user would.
  useFeatureFlagsStore(pinia).setPreference(CHARACTER_CARD_SYNC_FLAG.key, true)
  return { pinia, auth: useAuthStore(pinia), cards: useAiriCardStore(pinia) }
}

interface ServerDocument {
  revision: number
  deletedAt: string | null
  fields: Map<string, { revision: number, value: unknown }>
  /** Every field row the server ever wrote for this document, current and past. */
  history: Array<{ revision: number, key: string, value: unknown }>
}

/**
 * A server that stores each pushed field and counts the requests. It is a
 * network boundary. The conflict rules belong to the server tests.
 */
function createFakeCardServer() {
  const documents = new Map<string, ServerDocument>()
  const requests = { list: 0, push: 0 }
  /** The cards that the server refuses, as it does when the account has no room left. */
  const refusing = new Set<string>()

  function toWire() {
    return {
      documents: [...documents].map(([id, document]) => ({
        id,
        revision: document.revision,
        deletedAt: document.deletedAt,
        fields: document.deletedAt ? [] : [...document.fields].map(([key, field]) => ({ key, ...field })),
      })),
    }
  }

  const fetchCards = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const basePath = '/api/v1/character-cards'
    const parts = url.pathname.slice(url.pathname.indexOf(basePath) + basePath.length).replace(/^\/+/, '').split('/').filter(Boolean).map(decodeURIComponent)

    if (parts.length >= 2 && parts[1] === 'history') {
      requests.list += 1
      const document = documents.get(parts[0])
      if (!document)
        return new Response(null, { status: 404 })

      if (parts.length === 3) {
        const revision = Number(parts[2])
        if (revision > document.revision || !document.history.some(entry => entry.revision === revision))
          return new Response(null, { status: 404 })
        const atRevision = new Map<string, unknown>()
        for (const entry of document.history) {
          if (entry.revision <= revision)
            atRevision.set(entry.key, entry.value)
        }
        const fields = [...atRevision].filter(([, value]) => value !== null).map(([key, value]) => ({ key, value }))
        return Response.json({ revision, at: new Date(0).toISOString(), fields })
      }

      const revisions = [...new Set(document.history.map(entry => entry.revision))].sort((a, b) => b - a)
      const history = revisions.map(revision => ({
        revision,
        at: new Date(0).toISOString(),
        changed: document.history.filter(entry => entry.revision === revision && entry.value !== null).map(entry => entry.key),
        removed: document.history.filter(entry => entry.revision === revision && entry.value === null).map(entry => entry.key),
      }))
      return Response.json({ history })
    }

    const id = parts[0] ?? ''

    if (init?.method === 'PUT') {
      requests.push += 1
      if (refusing.has(id))
        return new Response(null, { status: 413, statusText: 'Payload Too Large' })
      const { fields } = JSON.parse(String(init.body)) as { fields: Array<{ key: string, value: unknown }> }
      const document: ServerDocument = documents.get(id) ?? { revision: 0, deletedAt: null, fields: new Map(), history: [] }
      document.revision += 1
      document.deletedAt = null
      for (const field of fields) {
        document.fields.set(field.key, { revision: document.revision, value: field.value })
        document.history.push({ revision: document.revision, key: field.key, value: field.value })
      }
      documents.set(id, document)
      return Response.json({ document: toWire().documents.find(candidate => candidate.id === id), conflicts: [] })
    }

    requests.list += 1
    return Response.json(toWire())
  })

  return {
    documents,
    requests,
    refusing,
    fetchCards,
    /** Stores a card as another device would. */
    seed(id: string, fields: Record<string, unknown>) {
      documents.set(id, {
        revision: 1,
        deletedAt: null,
        fields: new Map(Object.entries(fields).map(([key, value]) => [key, { revision: 1, value }])),
        history: Object.entries(fields).map(([key, value]) => ({ revision: 1, key, value })),
      })
    },
    /** Stores a card and then deletes it, as another device would. The content stays in its history. */
    seedDeleted(id: string, fields: Record<string, unknown>) {
      const history = Object.entries(fields).map(([key, value]) => ({ revision: 1, key, value }))
      const deletedRevision = 2
      for (const key of Object.keys(fields))
        history.push({ revision: deletedRevision, key, value: null })
      documents.set(id, { revision: deletedRevision, deletedAt: new Date(0).toISOString(), fields: new Map(), history })
    },
  }
}

/** The stubbed global fetch also catches unrelated requests, such as the feature-flags policy fetch. */
function cardRequestsOf(fetchCards: { mock: { calls: unknown[][] } }) {
  return fetchCards.mock.calls.filter(call => String(call[0]).includes('/character-cards'))
}

const accountId = () => `account-${crypto.randomUUID()}`

function signIn(auth: ReturnType<typeof useAuthStore>, id: string) {
  const user: User = { id, name: 'Alice', email: 'alice@example.com', emailVerified: true, createdAt: new Date(0), updatedAt: new Date(0) }
  const session: Session = { id: `session-${id}`, userId: id, token: 'test-token', expiresAt: new Date('2099-01-01'), createdAt: new Date(0), updatedAt: new Date(0) }
  auth.$patch({ user, session })
}

describe('card synchronization across windows', () => {
  let server: ReturnType<typeof createFakeCardServer>

  beforeEach(() => {
    localStorage.clear()
    server = createFakeCardServer()
    vi.stubGlobal('fetch', server.fetchCards)
  })

  afterEach(() => {
    for (const runtime of runtimes.splice(0))
      runtime.dispose()
    for (const pinia of piniaInstances.splice(0))
      disposePinia(pinia)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  async function createWindows() {
    const namespace = `card-sync-${crypto.randomUUID()}`
    const onError = vi.fn()
    const leaderRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only', onError })
    const leader = createContext(leaderRuntime)
    await expect.poll(() => leaderRuntime.isLeader()).toBe(true)
    await leader.cards.initialize()

    const followerRuntime = createSyncedPiniaPlugin({ namespace, leadership: 'follower-only', onError })
    const follower = createContext(followerRuntime)
    await expect.poll(() => follower.cards.activeCard).toBeDefined()

    return { leader, follower, onError }
  }

  it('sends a card that a follower added to the server', async () => {
    const { leader, follower, onError } = await createWindows()
    signIn(leader.auth, accountId())
    await expect.poll(() => follower.auth.userId).toBe(leader.auth.userId)

    const cardId = await follower.cards.addCard({ name: 'Luna', version: '1.0.0', description: 'Calm' }, 'scratch')

    await expect.poll(() => server.documents.get(cardId)?.fields.get('/name')?.value, { timeout: 8000 }).toBe('Luna')
    expect(onError).not.toHaveBeenCalled()
  })

  // A follower that ran the action itself would write the remote card into its own
  // state and send the plugin a replaceState proposal. The leader must write it.
  it('runs the synchronization that a follower requests in the leader', async () => {
    const { leader, follower, onError } = await createWindows()
    server.seed('remote', { '/name': 'Remote', '/version': '1.0.0' })
    signIn(leader.auth, accountId())
    await expect.poll(() => follower.auth.userId).toBe(leader.auth.userId)
    // The sign-in starts a run in the leader. Wait until it applied the remote card.
    await expect.poll(() => leader.cards.cards.get('remote')?.name).toBe('Remote')
    server.seed('another', { '/name': 'Another', '/version': '1.0.0' })
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')

    await follower.cards.synchronizeCards()

    expect(leader.cards.cards.get('another')?.name).toBe('Another')
    expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
    expect(onError).not.toHaveBeenCalled()
  })

  it('pushes a card once when both windows request a run at the same time', async () => {
    const { leader, follower, onError } = await createWindows()
    signIn(leader.auth, accountId())
    await expect.poll(() => follower.auth.userId).toBe(leader.auth.userId)
    const cardId = await leader.cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await expect.poll(() => follower.cards.cards.has(cardId)).toBe(true)

    await Promise.all([
      leader.cards.synchronizeCards(),
      follower.cards.synchronizeCards(),
      leader.cards.synchronizeCards(),
      follower.cards.synchronizeCards(),
    ])

    // The second window must wait for the active run. A second run that
    // pushes the same card would show a second push to the card.
    await expect.poll(() => server.documents.has(cardId)).toBe(true)
    expect(server.requests.push).toBe(1)
    expect(onError).not.toHaveBeenCalled()
  })

  // Found in the review of https://github.com/moeru-ai/airi/pull/2817
  // ROOT CAUSE:
  //
  // Each run assigned new cloud state objects. The leader published the store,
  // the follower wrote a new cards Map, and its cards watcher requested another run.
  //
  // We fixed this by keeping the objects when their content is equal.
  it('stops running after the cards match the server while a follower is open', async () => {
    const { leader, follower, onError } = await createWindows()
    signIn(leader.auth, accountId())
    await expect.poll(() => follower.auth.userId).toBe(leader.auth.userId)
    const cardId = await leader.cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await expect.poll(() => follower.cards.cardSyncStates[cardId], { timeout: 8000 }).toBe('synced')
    // Let the run that the card change requested finish.
    await new Promise(resolve => setTimeout(resolve, 2000))
    const listsAfterSync = server.requests.list

    // Two debounce periods of the cards watcher.
    await new Promise(resolve => setTimeout(resolve, 3500))

    expect(server.requests.list).toBe(listsAfterSync)
    expect(onError).not.toHaveBeenCalled()
  })

  it('does not publish a follower state proposal after a remote card arrives', async () => {
    const { leader, follower, onError } = await createWindows()
    server.seed('remote', { '/name': 'Remote', '/version': '1.0.0' })
    signIn(leader.auth, accountId())
    await expect.poll(() => follower.auth.userId).toBe(leader.auth.userId)
    const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')

    await leader.cards.synchronizeCards()

    await expect.poll(() => follower.cards.cards.get('remote')?.name).toBe('Remote')
    // replaceState is the plugin's follower-to-leader proposal RPC. A received
    // snapshot must not call it, even when the follower watches the cards.
    expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
    expect(onError).not.toHaveBeenCalled()
  })

  it('shows the cloud state of each card in every window', async () => {
    const { leader, follower } = await createWindows()
    expect(follower.cards.cardSyncStates).toEqual({})
    signIn(leader.auth, accountId())
    await expect.poll(() => follower.auth.userId).toBe(leader.auth.userId)

    const cardId = await follower.cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await expect.poll(() => follower.cards.cardSyncStates[cardId]).toBe('pending')
    await expect.poll(() => follower.cards.cardSyncStates[cardId], { timeout: 8000 }).toBe('synced')
    // The built-in card has no edit, so it has nothing to send.
    expect(follower.cards.cardSyncStates.default).toBe('synced')

    await follower.cards.updateCard(cardId, { ...follower.cards.cards.get(cardId)!, name: 'Nova' })
    await expect.poll(() => follower.cards.cardSyncStates[cardId]).toBe('pending')
    await expect.poll(() => follower.cards.cardSyncStates[cardId], { timeout: 8000 }).toBe('synced')
  })

  // The server answers 413 for a card when the account is full. The card must
  // not hold back the cards after it, and the window must tell the user.
  it('marks a card that the server refuses and still sends the other cards', async () => {
    const { leader, follower, onError } = await createWindows()
    signIn(leader.auth, accountId())
    await expect.poll(() => follower.auth.userId).toBe(leader.auth.userId)
    const refusedId = await leader.cards.addCard({ name: 'Too much', version: '1.0.0' }, 'scratch')
    const acceptedId = await leader.cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    server.refusing.add(refusedId)

    await leader.cards.synchronizeCards()

    await expect.poll(() => follower.cards.cardSyncStates[refusedId]).toBe('refused')
    expect(follower.cards.cardSyncStates[acceptedId]).toBe('synced')
    expect(server.documents.has(acceptedId)).toBe(true)
    expect(server.documents.has(refusedId)).toBe(false)
    expect(follower.cards.cards.get(refusedId)?.name).toBe('Too much')
    expect(onError).not.toHaveBeenCalled()
  })

  it('sends nothing for a user without an account', async () => {
    const { follower, onError } = await createWindows()

    await follower.cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await follower.cards.synchronizeCards()

    expect(cardRequestsOf(server.fetchCards)).toEqual([])
    expect(onError).not.toHaveBeenCalled()
  })

  // Found in the review of https://github.com/moeru-ai/airi/pull/2817
  // ROOT CAUSE:
  //
  // A push waits 1500 ms for the cards watcher, but the polls waited 1000 ms.
  // The restore also merged the snapshot, so later fields stayed.
  //
  // We fixed this with a longer poll timeout and a full card replace.
  it('restores a card to the content it had at a past revision', async () => {
    const { leader, follower, onError } = await createWindows()
    signIn(leader.auth, accountId())
    await expect.poll(() => follower.auth.userId).toBe(leader.auth.userId)
    const cardId = await leader.cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await expect.poll(() => server.documents.get(cardId)?.fields.get('/name')?.value, { timeout: 8000 }).toBe('Luna')
    const firstRevision = server.documents.get(cardId)!.history.find(entry => entry.key === '/name')!.revision

    await leader.cards.updateCard(cardId, { ...leader.cards.cards.get(cardId)!, name: 'Nova', scenario: 'A rainy city' })
    await expect.poll(() => server.documents.get(cardId)?.fields.get('/name')?.value, { timeout: 8000 }).toBe('Nova')

    const restored = await leader.cards.restoreCardVersion(cardId, firstRevision)

    expect(restored).toBe(true)
    expect(leader.cards.cards.get(cardId)?.name).toBe('Luna')
    expect(leader.cards.cards.get(cardId)?.scenario).toBeUndefined()
    expect(onError).not.toHaveBeenCalled()
  })

  it('returns false for a revision the server does not have', async () => {
    const { leader, onError } = await createWindows()
    signIn(leader.auth, accountId())
    const cardId = await leader.cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await expect.poll(() => server.documents.get(cardId)?.fields.get('/name')?.value, { timeout: 8000 }).toBe('Luna')

    expect(await leader.cards.restoreCardVersion(cardId, 999)).toBe(false)
    expect(onError).not.toHaveBeenCalled()
  })

  it('restores a card that another device deleted, from the content before the deletion', async () => {
    const { leader, onError } = await createWindows()
    server.seedDeleted('remote', { '/name': 'Remote', '/version': '1.0.0' })
    signIn(leader.auth, accountId())

    const restored = await leader.cards.restoreDeletedCard('remote')

    expect(restored).toBe(true)
    expect(leader.cards.cards.get('remote')?.name).toBe('Remote')
    expect(onError).not.toHaveBeenCalled()
  })

  it('returns false when restoring a card the server does not report as deleted', async () => {
    const { leader, onError } = await createWindows()
    server.seed('remote', { '/name': 'Remote', '/version': '1.0.0' })
    signIn(leader.auth, accountId())

    expect(await leader.cards.restoreDeletedCard('remote')).toBe(false)
    expect(onError).not.toHaveBeenCalled()
  })

  it('sends nothing while cloud sync is off, the default, even for a signed-in user', async () => {
    const { leader, onError } = await createWindows()
    useFeatureFlagsStore(leader.pinia).setPreference(CHARACTER_CARD_SYNC_FLAG.key, false)
    signIn(leader.auth, accountId())
    await leader.cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')

    await leader.cards.synchronizeCards()

    expect(cardRequestsOf(server.fetchCards)).toEqual([])
    expect(leader.cards.cardSyncStates).toEqual({})
    expect(onError).not.toHaveBeenCalled()
  })

  it('starts a run as soon as a signed-in user turns cloud sync on', async () => {
    const { leader, onError } = await createWindows()
    useFeatureFlagsStore(leader.pinia).setPreference(CHARACTER_CARD_SYNC_FLAG.key, false)
    signIn(leader.auth, accountId())
    const cardId = await leader.cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    expect(cardRequestsOf(server.fetchCards)).toEqual([])

    useFeatureFlagsStore(leader.pinia).setPreference(CHARACTER_CARD_SYNC_FLAG.key, true)

    await expect.poll(() => server.documents.get(cardId)?.fields.get('/name')?.value).toBe('Luna')
    expect(onError).not.toHaveBeenCalled()
  })
})
