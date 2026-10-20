import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useAuthStore } from './auth'
import { useInboxStore } from './inbox'

interface CloudCall {
  route: string
  authorization: string | null
  query: URLSearchParams
}

type Reply = Response | Promise<Response>

const fluxGranted = { id: 'm1', kind: 'flux.granted', params: { amount: 500, reason: 'Thanks for testing.' }, readAt: '', createdAt: '2026-10-18T08:00:00Z' }
const renewed = { id: 'm2', kind: 'subscription.renewed', params: { plan: 'Pro', periodEnd: '2026-11-14T00:00:00Z' }, readAt: '2026-10-15T00:00:00Z', createdAt: '2026-10-14T00:00:00Z' }
const unknownKind = { id: 'm3', kind: 'account.banned', params: {}, readAt: '', createdAt: '2026-10-13T00:00:00Z' }
const invalidParams = { id: 'm4', kind: 'flux.granted', params: { amount: -1, reason: '' }, readAt: '', createdAt: '2026-10-12T00:00:00Z' }
const paymentFailed = { id: 'm5', kind: 'subscription.payment_failed', params: { plan: 'Pro' }, readAt: '', createdAt: '2026-10-11T00:00:00Z' }

describe('inbox store', () => {
  let pinia: ReturnType<typeof createPinia>
  let calls: CloudCall[]
  let routes: Record<string, (call: CloudCall) => Reply>

  beforeEach(() => {
    localStorage.clear()
    calls = []
    routes = {
      'GET /v1/inbox/unread-count': () => Response.json({ unread: 3 }),
    }
    pinia = createPinia()
    setActivePinia(pinia)
    // Cloud and the Auth credit read are the HTTP boundaries. Each test answers Cloud routes.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const request = input instanceof Request ? input : new Request(input)
      const url = new URL(request.url)
      if (url.pathname.includes('/flux'))
        return Promise.resolve(Response.json({ flux: 0 }))
      const call = {
        route: `${request.method} ${url.pathname}`,
        authorization: new Headers(init?.headers).get('Authorization'),
        query: url.searchParams,
      }
      calls.push(call)
      const handler = routes[call.route]
      return Promise.resolve(handler ? handler(call) : new Response(null, { status: 404 }))
    })
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.useRealTimers()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  async function signIn(id = 'user-1') {
    const auth = useAuthStore()
    auth.token = `${id}-token`
    auth.user = { id, name: id, email: `${id}@example.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
    auth.session = { id, userId: id, token: id, expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() }
    await nextTick()
  }

  function countCalls(route: string) {
    return calls.filter(call => call.route === route).length
  }

  it('refreshes the unread count on sign-in, window focus, and every 5 minutes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const inbox = useInboxStore()
    await nextTick()
    expect(countCalls('GET /v1/inbox/unread-count')).toBe(0)

    await signIn()
    await vi.waitFor(() => expect(inbox.unread).toBe(3))
    expect(calls[0]?.authorization).toBe('Bearer user-1-token')
    expect(countCalls('GET /v1/inbox')).toBe(0)

    routes['GET /v1/inbox/unread-count'] = () => Response.json({ unread: 4 })
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => expect(inbox.unread).toBe(4))

    routes['GET /v1/inbox/unread-count'] = () => Response.json({ unread: 5 })
    vi.advanceTimersByTime(5 * 60 * 1000)
    await vi.waitFor(() => expect(inbox.unread).toBe(5))
  })

  it('loads pages on demand and skips unknown kinds and invalid params', async () => {
    routes['GET /v1/inbox'] = ({ query }) => query.get('cursor') === 'page-2'
      ? Response.json({ messages: [paymentFailed], nextCursor: '' })
      : Response.json({ messages: [fluxGranted, renewed, unknownKind, invalidParams], nextCursor: 'page-2' })
    const inbox = useInboxStore()
    await signIn()

    await inbox.loadFirstPage()
    expect(inbox.messages.map(message => message.id)).toEqual(['m1', 'm2'])
    expect(inbox.hasMore).toBe(true)
    expect(calls.find(call => call.route === 'GET /v1/inbox')?.query.get('limit')).toBe('20')

    await inbox.loadMore()
    expect(inbox.messages.map(message => message.id)).toEqual(['m1', 'm2', 'm5'])
    expect(inbox.hasMore).toBe(false)
  })

  it('marks one message read at once and rolls back when Cloud fails', async () => {
    routes['GET /v1/inbox'] = () => Response.json({ messages: [fluxGranted, renewed], nextCursor: '' })
    let finishRead!: (response: Response) => void
    routes['POST /v1/inbox/m1/read'] = () => new Promise(resolve => finishRead = resolve)
    const inbox = useInboxStore()
    await signIn()
    await inbox.loadFirstPage()
    await vi.waitFor(() => expect(inbox.unread).toBe(3))

    const pending = inbox.markRead('m1')
    expect(inbox.unread).toBe(2)
    expect(inbox.messages[0]?.readAt).not.toBe('')

    await vi.waitFor(() => expect(countCalls('POST /v1/inbox/m1/read')).toBe(1))
    finishRead(Response.json({ code: 503, message: 'unavailable' }, { status: 503 }))
    await pending
    expect(inbox.unread).toBe(3)
    expect(inbox.messages[0]?.readAt).toBe('')

    await inbox.markRead('m2')
    expect(countCalls('POST /v1/inbox/m2/read')).toBe(0)
  })

  it('marks all messages read at once and rolls back when Cloud fails', async () => {
    routes['GET /v1/inbox'] = () => Response.json({ messages: [fluxGranted, renewed, paymentFailed], nextCursor: '' })
    routes['POST /v1/inbox/read-all'] = () => Response.json({ code: 500, message: 'failed' }, { status: 500 })
    const inbox = useInboxStore()
    await signIn()
    await inbox.loadFirstPage()
    await vi.waitFor(() => expect(inbox.unread).toBe(3))

    const pending = inbox.markAllRead()
    expect(inbox.unread).toBe(0)
    expect(inbox.messages.every(message => message.readAt !== '')).toBe(true)

    await pending
    expect(inbox.unread).toBe(3)
    expect(inbox.messages.map(message => message.readAt)).toEqual(['', renewed.readAt, ''])
  })

  it('clears state on sign-out and drops a response from the old session', async () => {
    let finishList!: (response: Response) => void
    routes['GET /v1/inbox'] = () => new Promise(resolve => finishList = resolve)
    const inbox = useInboxStore()
    await signIn()
    await vi.waitFor(() => expect(inbox.unread).toBe(3))

    const pending = inbox.loadFirstPage()
    await vi.waitFor(() => expect(countCalls('GET /v1/inbox')).toBe(1))
    expect(inbox.loading).toBe(true)

    const auth = useAuthStore()
    auth.user = null
    auth.session = null
    auth.token = null
    await nextTick()
    expect(inbox.unread).toBe(0)
    expect(inbox.loading).toBe(false)
    expect(inbox.signedIn).toBe(false)

    finishList(Response.json({ messages: [fluxGranted], nextCursor: '' }))
    await pending
    expect(inbox.messages).toEqual([])
    expect(inbox.loaded).toBe(false)
  })
})
