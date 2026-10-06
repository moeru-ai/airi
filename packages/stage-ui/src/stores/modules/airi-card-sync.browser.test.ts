import type { Session, User } from 'better-auth'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'

import { PiniaColada } from '@pinia/colada'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'

import { useAuthStore } from '../auth'
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
  return { pinia, auth: useAuthStore(pinia), cards: useAiriCardStore(pinia) }
}

interface ServerDocument {
  revision: number
  fields: Map<string, { revision: number, value: unknown }>
}

/**
 * A server that stores each pushed field and counts the requests. It is a
 * network boundary. The conflict rules belong to the server tests.
 */
function createFakeCardServer() {
  const documents = new Map<string, ServerDocument>()
  const requests = { list: 0, push: 0 }

  function toWire() {
    return {
      documents: [...documents].map(([id, document]) => ({
        id,
        revision: document.revision,
        deletedAt: null,
        fields: [...document.fields].map(([key, field]) => ({ key, ...field })),
      })),
    }
  }

  const fetchCards = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? '')

    if (init?.method === 'PUT') {
      requests.push += 1
      const { fields } = JSON.parse(String(init.body)) as { fields: Array<{ key: string, value: unknown }> }
      const document = documents.get(id) ?? { revision: 0, fields: new Map() }
      document.revision += 1
      for (const field of fields)
        document.fields.set(field.key, { revision: document.revision, value: field.value })
      documents.set(id, document)
      return Response.json({ document: toWire().documents.find(candidate => candidate.id === id), conflicts: [] })
    }

    requests.list += 1
    return Response.json(toWire())
  })

  return {
    documents,
    requests,
    fetchCards,
    /** Stores a card as another device would. */
    seed(id: string, fields: Record<string, unknown>) {
      documents.set(id, { revision: 1, fields: new Map(Object.entries(fields).map(([key, value]) => [key, { revision: 1, value }])) })
    },
  }
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

  it('sends nothing for a user without an account', async () => {
    const { follower, onError } = await createWindows()

    await follower.cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await follower.cards.synchronizeCards()

    expect(server.fetchCards).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })
})
