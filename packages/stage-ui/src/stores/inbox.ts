import type { InboxMessage } from '../components/scenarios/notifications/inbox-presentation'

import { errorMessageFrom } from '@moeru/std'
import {
  inboxServiceGetInboxUnreadCount,
  inboxServiceListInboxMessages,
  inboxServiceMarkAllInboxMessagesRead,
  inboxServiceMarkInboxMessageRead,
} from '@proj-airi/cloud-client'
import { useIntervalFn, useWindowFocus } from '@vueuse/core'
import { defineStore } from 'pinia'
import { array, integer, isoTimestamp, minValue, nonEmpty, number, object, parse, pipe, record, safeParse, string, unknown } from 'valibot'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

import { isRenderableInboxMessage } from '../components/scenarios/notifications/inbox-presentation'
import { authedFetch } from '../libs/auth-fetch'
import { useAuthStore } from './auth'

/** Each panel page asks for this many messages. Cloud uses 20 when the limit is zero. */
const PAGE_SIZE = 20
/** The badge stays current without a push channel. Window focus also refreshes it. */
const UNREAD_REFRESH_INTERVAL_MS = 5 * 60 * 1000
/** A slow Cloud request must not hold the panel in its loading state. */
const REQUEST_TIMEOUT_MS = 10_000

const unreadCountSchema = object({ unread: pipe(number(), integer(), minValue(0)) })
// Messages are checked one by one, so one invalid message does not hide the whole page.
const pageSchema = object({ messages: array(unknown()), nextCursor: string() })
const messageSchema = object({
  id: pipe(string(), nonEmpty()),
  kind: string(),
  params: record(string(), unknown()),
  readAt: string(),
  createdAt: pipe(string(), isoTimestamp()),
})

/**
 * Owns the Notifications state of the signed-in account in this window.
 *
 * State model:
 * - `unread` is the server count. It refreshes when the account signs in, on window focus,
 *   and every 5 minutes. Read actions change it at once and roll it back on failure.
 * - `messages` and `nextCursor` load only when a panel opens. `loadMore` follows the cursor.
 * - A sign-out or an account change clears all state and drops each response that is in flight.
 *
 * Requests go through {@link authedFetch}, so a 401 refreshes the access token once.
 */
export const useInboxStore = defineStore('inbox', () => {
  const auth = useAuthStore()
  const baseUrl = import.meta.env.VITE_CLOUD_URL || 'https://cloud.airi.build'

  const unread = shallowRef(0)
  const messages = shallowRef<InboxMessage[]>([])
  const nextCursor = shallowRef('')
  /** True after the first page loads. The panel shows a spinner before that. */
  const loaded = shallowRef(false)
  const loading = shallowRef(false)
  const loadingMore = shallowRef(false)
  /** The list request failed. The panel shows a retry action. */
  const error = shallowRef(false)

  const signedIn = computed(() => auth.isAuthenticated && !!auth.token)
  const hasMore = computed(() => nextCursor.value !== '')

  // A session change advances `generation`. A response from an older generation belongs to
  // another account or to a signed-out window, so it is dropped.
  let generation = 0
  // A read action advances `writes`. An unread count that was read before the write can be
  // stale, so it is dropped. The next refresh gets the final count.
  let writes = 0
  let controller = new AbortController()

  function requestOptions() {
    return {
      baseUrl,
      fetch: authedFetch,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      throwOnError: true as const,
    }
  }

  function readPage(data: unknown) {
    const page = parse(pageSchema, data)
    const items: InboxMessage[] = []
    for (const item of page.messages) {
      const message = safeParse(messageSchema, item)
      if (message.success && isRenderableInboxMessage(message.output))
        items.push(message.output)
    }
    return { items, nextCursor: page.nextCursor }
  }

  function reset() {
    generation++
    controller.abort()
    controller = new AbortController()
    unread.value = 0
    messages.value = []
    nextCursor.value = ''
    loaded.value = false
    loading.value = false
    loadingMore.value = false
    error.value = false
  }

  async function refreshUnread() {
    if (!signedIn.value)
      return
    const requestGeneration = generation
    const requestWrites = writes
    try {
      const { data } = await inboxServiceGetInboxUnreadCount(requestOptions())
      const count = parse(unreadCountSchema, data).unread
      if (requestGeneration === generation && requestWrites === writes)
        unread.value = count
    }
    catch (cause) {
      // The badge keeps its last count. The next focus or interval refresh retries.
      if (requestGeneration === generation)
        console.warn('Notifications unread count refresh failed', errorMessageFrom(cause) ?? 'Cloud request failed')
    }
  }

  /** Loads the first page again. A panel calls it each time it opens. */
  async function loadFirstPage() {
    if (!signedIn.value || loading.value)
      return
    const requestGeneration = generation
    loading.value = true
    error.value = false
    void refreshUnread()
    try {
      const { data } = await inboxServiceListInboxMessages({ ...requestOptions(), query: { limit: PAGE_SIZE } })
      const page = readPage(data)
      if (requestGeneration !== generation)
        return
      messages.value = page.items
      nextCursor.value = page.nextCursor
      loaded.value = true
    }
    catch (cause) {
      if (requestGeneration !== generation)
        return
      // Messages that loaded before stay visible. The error state shows only for an empty list.
      error.value = true
      console.warn('Notifications list request failed', errorMessageFrom(cause) ?? 'Cloud request failed')
    }
    finally {
      if (requestGeneration === generation)
        loading.value = false
    }
  }

  async function loadMore() {
    if (!signedIn.value || !hasMore.value || loading.value || loadingMore.value)
      return
    const requestGeneration = generation
    const cursor = nextCursor.value
    loadingMore.value = true
    try {
      const { data } = await inboxServiceListInboxMessages({ ...requestOptions(), query: { limit: PAGE_SIZE, cursor } })
      const page = readPage(data)
      // A first-page reload replaces the cursor. This page then belongs to the old list.
      if (requestGeneration !== generation || cursor !== nextCursor.value)
        return
      const known = new Set(messages.value.map(message => message.id))
      messages.value = [...messages.value, ...page.items.filter(message => !known.has(message.id))]
      nextCursor.value = page.nextCursor
    }
    catch (cause) {
      // The cursor stays, so the next scroll to the end retries the same page.
      if (requestGeneration === generation)
        console.warn('Notifications next page request failed', errorMessageFrom(cause) ?? 'Cloud request failed')
    }
    finally {
      if (requestGeneration === generation)
        loadingMore.value = false
    }
  }

  function setReadAt(ids: Set<string>, readAt: string) {
    messages.value = messages.value.map(message => ids.has(message.id) ? { ...message, readAt } : message)
  }

  /** Marks one message read when the user opens it. A read message sends no request. */
  async function markRead(id: string) {
    const message = messages.value.find(item => item.id === id)
    if (!signedIn.value || !message || message.readAt !== '')
      return
    const requestGeneration = generation
    const ids = new Set([id])
    writes++
    setReadAt(ids, new Date().toISOString())
    unread.value = Math.max(0, unread.value - 1)
    try {
      await inboxServiceMarkInboxMessageRead({ ...requestOptions(), path: { id } })
    }
    catch (cause) {
      if (requestGeneration !== generation)
        return
      setReadAt(ids, '')
      unread.value++
      console.warn('Notifications mark read failed', errorMessageFrom(cause) ?? 'Cloud request failed')
    }
  }

  async function markAllRead() {
    if (!signedIn.value)
      return
    const unreadIds = new Set(messages.value.filter(message => message.readAt === '').map(message => message.id))
    const previousUnread = unread.value
    if (previousUnread === 0 && unreadIds.size === 0)
      return
    const requestGeneration = generation
    writes++
    setReadAt(unreadIds, new Date().toISOString())
    unread.value = 0
    try {
      await inboxServiceMarkAllInboxMessagesRead(requestOptions())
    }
    catch (cause) {
      if (requestGeneration !== generation)
        return
      setReadAt(unreadIds, '')
      unread.value = previousUnread
      console.warn('Notifications mark all read failed', errorMessageFrom(cause) ?? 'Cloud request failed')
    }
  }

  // Sync flush clears the old account before any watcher or request of the new session runs.
  watch([() => auth.sessionVersion, () => auth.user?.id, signedIn], reset, { flush: 'sync' })
  watch(signedIn, (value) => {
    if (value)
      void refreshUnread()
  }, { immediate: true })

  useIntervalFn(() => void refreshUnread(), UNREAD_REFRESH_INTERVAL_MS)
  watch(useWindowFocus(), (focused) => {
    if (focused)
      void refreshUnread()
  })
  onScopeDispose(reset)

  return {
    unread,
    messages,
    loaded,
    loading,
    loadingMore,
    error,
    hasMore,
    signedIn,
    refreshUnread,
    loadFirstPage,
    loadMore,
    markRead,
    markAllRead,
  }
})
