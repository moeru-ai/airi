<script setup lang="ts">
import type { ChatSessionMeta } from '../../../../types/chat-session'
import type { SessionRow } from './sessions-list.vue'

import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionsDialog from './sessions-dialog.vue'

import { useAnalytics } from '../../../../composables/use-analytics'
import { useBreakpoints } from '../../../../composables/use-breakpoints'
import { extractMessageText } from '../../../../libs/chat-sync'
import { useAuthStore } from '../../../../stores/auth'
import { useChatStore } from '../../../../stores/chat'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../../../stores/modules/consciousness'

const showDialog = defineModel({ type: Boolean, default: false, required: false })

const { isDesktop } = useBreakpoints()
const { t, locale } = useI18n()

const chatSession = useChatSessionStore()
const chat = useChatStore()
const { sessionMetas, sessionMessages, activeSessionId } = storeToRefs(chatSession)
const { activeCardId } = storeToRefs(useAiriCardStore())
const { userId } = storeToRefs(useAuthStore())
const { activeModel } = storeToRefs(useConsciousnessStore())
const { trackChatSessionSelected, trackChatSessionStarted } = useAnalytics()

// Creating includes persistence and cloud reconciliation, so prevent a
// second click from creating an orphan session while the first is pending.
const isCreatingSession = ref(false)

// Keep another account's sessions hidden while an account swap rehydrates.
const ownedSessions = computed(() => {
  const effectiveUserId = userId.value || 'local'
  return Object.values(sessionMetas.value).filter(meta => meta.userId === effectiveUserId)
})

/**
 * Normalizes a session into its one-line drawer preview.
 *
 * @example
 * previewFor({ title: 'Moon notes', ...meta })
 * // => 'Moon notes'
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
 * Normalizes an epoch timestamp into a coarse relative label.
 *
 * @example
 * formatUpdatedAt(Date.now() - 5 * 60 * 1000)
 * // => '5 minutes ago'
 */
function formatUpdatedAt(ts: number): string {
  const formatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
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
  list.sort((a, b) => b.meta.updatedAt - a.meta.updatedAt)
  return list
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
  await chatSession.setActiveSession(sessionId)
  showDialog.value = false
}

async function startNewSession() {
  if (isCreatingSession.value)
    return
  isCreatingSession.value = true
  try {
    const characterId = activeCardId.value || 'default'
    const selectionBeforeCreation = activeSessionId.value
    // Creation runs in the synchronized leader, while navigation belongs to
    // this window. Activating inside createSession would navigate the leader.
    const sessionId = await chatSession.createSession(characterId, { setActive: false })
    // Rows remain interactive while creation is persisted in the leader. Do
    // not let that stale continuation replace a newer local user selection.
    if (activeSessionId.value === selectionBeforeCreation)
      await chatSession.setActiveSession(sessionId)
    // Store-created sessions also include restore and fork flows; only this
    // user action belongs in the retention denominator.
    trackChatSessionStarted(activeModel.value || 'unknown')
    showDialog.value = false
  }
  finally {
    isCreatingSession.value = false
  }
}

// Per-open generation counter. The batch loadSession loop checks this before
// each batch so closing the drawer mid-load aborts cleanly instead of
// continuing to hydrate sessions the user has navigated away from. Without
// this, a session deleted from outside while the batch was running could be
// re-added to `loadedSessions` as a phantom entry.
let openGeneration = 0

watch(showDialog, async (open) => {
  if (!open)
    return
  openGeneration += 1
  const myGeneration = openGeneration
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
    @new-session="startNewSession"
    @select-session="selectSession"
    @delete-session="chat.deleteSession"
  >
    <template #trigger>
      <slot name="trigger" />
    </template>
  </SessionsDialog>
</template>
