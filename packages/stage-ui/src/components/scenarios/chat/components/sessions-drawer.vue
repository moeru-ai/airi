<script setup lang="ts">
import type { ChatSessionMeta } from '../../../../types/chat-session'

import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionsDialog from './sessions-dialog.vue'

import { useAnalytics } from '../../../../composables/use-analytics'
import { useBreakpoints } from '../../../../composables/use-breakpoints'
import { extractMessageText } from '../../../../libs/chat-sync'
import { useAuthStore } from '../../../../stores/auth'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../../../stores/modules/consciousness'

/** Session mutations supplied by a host that owns chat state in another runtime. */
interface ChatSessionActions {
  /** Creates and activates a session for the requested character. */
  createSession: (characterId: string) => Promise<string>
  /** Deletes a session and selects an authority-owned fallback when necessary. */
  deleteSession: (sessionId: string) => Promise<void>
  /** Makes an existing session active. */
  selectSession: (sessionId: string) => Promise<void>
}

interface Props {
  /**
   * Overrides local store mutations when the host window is a synchronized
   * follower. The default writes directly to the local session store.
   */
  sessionActions?: ChatSessionActions
}

const props = defineProps<Props>()

/**
 * Bottom-sheet (mobile) / centered-modal (desktop) UI surface that lists every
 * chat session belonging to the current user, lets the user switch between
 * them, and start a fresh session for the active character.
 *
 * Use when:
 * - The user is on a stage page and wants to browse / switch conversations.
 *   Mounted once near the global ChatArea so any input bar can flip the
 *   `v-model` open.
 *
 * Expects:
 * - `useChatSessionStore` is initialized — `sessionMetas` and `activeSessionId`
 *   drive the list, and switching calls `setActiveSession` / `createSession`.
 *
 * Returns:
 * - A scrollable list. List items render the session title (or first user
 *   message preview as a fallback), a cloud-sync badge, and a relative
 *   updatedAt timestamp.
 */

const showDialog = defineModel({ type: Boolean, default: false, required: false })

const { isDesktop } = useBreakpoints()
const screenSafeArea = useScreenSafeArea()
const { t } = useI18n()

const chatSession = useChatSessionStore()
const { sessionMetas, sessionMessages, activeSessionId } = storeToRefs(chatSession)
const { activeCardId } = storeToRefs(useAiriCardStore())
const { userId } = storeToRefs(useAuthStore())
const { activeModel } = storeToRefs(useConsciousnessStore())
const { trackChatSessionSelected, trackChatSessionStarted } = useAnalytics()

// Re-entry guard for the "new session" button. Without this, a rapid
// double-click would call `createSession` twice (creating two orphan
// sessions) and emit duplicate `chat_session_started` analytics events.
// The async `createSession` includes IndexedDB writes + a cloud reconcile
// kick-off, so even a single click can stay in flight long enough for a
// second click to slip through.
const isCreatingSession = ref(false)

useResizeObserver(document.documentElement, () => screenSafeArea.update())
onMounted(() => screenSafeArea.update())

interface SessionRow {
  meta: ChatSessionMeta
  preview: string
  isActive: boolean
  updatedAtLabel: string
}

/**
 * Sessions visible in the drawer. Filters by the currently effective user
 * (`userId.value || 'local'`) so:
 * - Anonymous users see their local-only sessions (previously hidden by a
 *   blanket `userId !== 'local'` filter).
 * - After an account swap, the previously signed-in user's sessions stay
 *   hidden until ensureActiveSessionForCharacter rehydrates the new tenant
 *   (the session-store also clears in-memory state on user change as a
 *   defense in depth).
 */
const ownedSessions = computed(() => {
  const effectiveUserId = userId.value || 'local'
  return Object.values(sessionMetas.value).filter(meta => meta.userId === effectiveUserId)
})

/**
 * Pull a 1-line preview from the first non-system message; falls back to the
 * stored title or a generic placeholder when nothing readable is available.
 *
 * Before:
 * - messages: [system, { role: 'user', content: 'Tell me about the moon today' }, ...]
 *
 * After:
 * - "Tell me about the moon today"
 */
function previewFor(meta: ChatSessionMeta): string {
  if (meta.title)
    return meta.title

  const messages = sessionMessages.value[meta.sessionId] ?? []
  for (const message of messages) {
    if (message.role === 'system')
      continue
    const trimmed = extractMessageText(message).replace(/\s+/g, ' ').trim()
    if (trimmed)
      return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed
  }

  return t('stage.chat.sessions.new-chat-fallback')
}

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/**
 * Format an epoch ms timestamp as a coarse relative label like "3 minutes ago".
 *
 * Before:
 * - Date.now() - 5 * 60 * 1000
 *
 * After:
 * - "5 minutes ago"
 */
function formatUpdatedAt(ts: number): string {
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const delta = ts - Date.now()
  const abs = Math.abs(delta)
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) {
      const value = Math.round(delta / ms)
      return formatter.format(value, unit)
    }
  }
  return formatter.format(0, 'second')
}

const rows = computed<SessionRow[]>(() => {
  const list = ownedSessions.value
    .map<SessionRow>(meta => ({
      meta,
      preview: previewFor(meta),
      isActive: meta.sessionId === activeSessionId.value,
      updatedAtLabel: formatUpdatedAt(meta.updatedAt),
    }))
  // Most-recent first; the active session usually ends up at the top after a
  // fresh send because `persistSession` bumps `updatedAt`.
  list.sort((a, b) => b.meta.updatedAt - a.meta.updatedAt)
  return list
})

const mobilePaddingBottom = computed(() => {
  const safeAreaBottom = Number.parseFloat(screenSafeArea.bottom.value.replace('px', ''))
  return `${Math.max(safeAreaBottom, 24)}px`
})

async function selectSession(sessionId: string) {
  const selectedRow = rows.value.find(row => row.meta.sessionId === sessionId)
  if (sessionId !== activeSessionId.value && selectedRow) {
    trackChatSessionSelected({
      source: 'sessions_drawer',
      message_count: (sessionMessages.value[sessionId] ?? []).filter(message => message.role !== 'system').length,
      cloud_synced: !!selectedRow.meta.cloudChatId,
    })
  }
  if (props.sessionActions)
    await props.sessionActions.selectSession(sessionId)
  else
    chatSession.setActiveSession(sessionId)
  showDialog.value = false
}

async function startNewSession() {
  if (isCreatingSession.value)
    return
  isCreatingSession.value = true
  try {
    const characterId = activeCardId.value || 'default'
    if (props.sessionActions)
      await props.sessionActions.createSession(characterId)
    else
      await chatSession.createSession(characterId, { setActive: true })
    // PostHog retention denominator. We pick this call site (UI new-session
    // button) rather than `createSession` in the store because the store also
    // creates sessions for cloud-reconcile / fork / restore flows that aren't
    // user-initiated. Model id is informational; sessionIndex is omitted
    // (PostHog can compute it from per-user event ordering).
    trackChatSessionStarted(activeModel.value || 'unknown')
    showDialog.value = false
  }
  finally {
    isCreatingSession.value = false
  }
}

async function deleteSession(sessionId: string) {
  if (props.sessionActions)
    await props.sessionActions.deleteSession(sessionId)
  else
    await chatSession.deleteSession(sessionId)
}

// Per-open generation counter. The batch loadSession loop checks this before
// each batch so closing the drawer mid-load aborts cleanly instead of
// continuing to hydrate sessions the user has navigated away from. Without
// this, a session deleted from outside while the batch was running could be
// re-added to `loadedSessions` as a phantom entry.
let openGeneration = 0

// Re-render relative timestamps + hydrate non-active session messages when
// the drawer opens so each row can show a real preview instead of the
// fallback. `loadSession` is idempotent (`loadedSessions` set), so reopening
// the drawer is cheap.
watch(showDialog, async (open) => {
  if (!open)
    return
  openGeneration += 1
  const myGeneration = openGeneration
  // Touch `rows` first so reactive labels reflect a fresh `Date.now()`.
  void rows.value
  const knownSessionIds = ownedSessions.value.map(meta => meta.sessionId)
  // Bounded concurrency keeps a long history list from spawning a hundred
  // simultaneous IndexedDB transactions; 4 in flight is plenty for a list
  // that the user is about to scroll.
  const batchSize = 4
  for (let i = 0; i < knownSessionIds.length; i += batchSize) {
    if (myGeneration !== openGeneration || !showDialog.value)
      return
    await Promise.all(knownSessionIds.slice(i, i + batchSize).map(id => chatSession.loadSession(id)))
  }
})
</script>

<template>
  <SessionsDialog
    v-model:open="showDialog"
    :rows="rows"
    :is-desktop="isDesktop"
    :is-creating-session="isCreatingSession"
    :mobile-padding-bottom="mobilePaddingBottom"
    @new-session="startNewSession"
    @select-session="selectSession"
    @delete-session="deleteSession"
  >
    <template #trigger>
      <slot name="trigger" />
    </template>
  </SessionsDialog>
</template>
