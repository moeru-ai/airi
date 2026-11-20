<script setup lang="ts">
import type { ChatSessionFolder, ChatSessionMeta } from '../../../../types/chat-session'
import type { SessionRow } from './session-row.vue'

import { useNow } from '@vueuse/core'
import { intlFormatDistance } from 'date-fns'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionsDialog from './sessions-dialog.vue'

import { useAnalytics } from '../../../../composables/use-analytics'
import { useBreakpoints } from '../../../../composables/use-breakpoints'
import { useCharacterPreviews } from '../../../../composables/use-character-previews'
import { extractMessageText } from '../../../../libs/chat-sync'
import { useAuthStore } from '../../../../stores/auth'
import { useChatStore } from '../../../../stores/chat'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../../../stores/modules/consciousness'

const props = withDefaults(defineProps<{
  desktopMode?: 'dialog' | 'popover'
}>(), {
  desktopMode: 'dialog',
})

const showDialog = defineModel({ type: Boolean, default: false, required: false })

const { isDesktop } = useBreakpoints()
const { t, locale } = useI18n()
const now = useNow({ interval: 60_000 })

const chatSession = useChatSessionStore()
const chat = useChatStore()
const { sessionMetas, sessionMessages, activeSessionId, index } = storeToRefs(chatSession)
const { activeCardId, cards } = storeToRefs(useAiriCardStore())
const characterPreviews = useCharacterPreviews()
const { userId } = storeToRefs(useAuthStore())
const { activeModel } = storeToRefs(useConsciousnessStore())
const { trackChatSessionSelected, trackChatSessionStarted, trackConversationRenamed } = useAnalytics()

// Creating includes persistence and cloud reconciliation, so prevent a
// second click from creating an orphan session while the first is pending.
const isCreatingSession = ref(false)

// Keep another account's sessions hidden while an account swap rehydrates.
// Background recipe sessions are hidden too. Their results reach the conversation as notices.
const ownedSessions = computed(() => {
  const effectiveUserId = userId.value || 'local'
  return Object.values(sessionMetas.value).filter(meta => meta.userId === effectiveUserId && !meta.hidden)
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

function activityAtFor(meta: ChatSessionMeta): number {
  let lastMessageAt: number | undefined
  for (const message of sessionMessages.value[meta.sessionId] ?? []) {
    if (message.role !== 'user' && message.role !== 'assistant')
      continue
    const timestamp = message.createdAt
    if (timestamp == null || !Number.isFinite(new Date(timestamp).getTime()))
      continue
    lastMessageAt = lastMessageAt == null ? timestamp : Math.max(lastMessageAt, timestamp)
  }
  return lastMessageAt ?? meta.createdAt
}

const rows = computed<SessionRow[]>(() => {
  const referenceTime = Math.max(now.value.getTime(), Date.now())
  return ownedSessions.value
    .map(meta => ({ meta, activityAt: activityAtFor(meta) }))
    .sort((first, second) => second.activityAt - first.activityAt)
    .map(({ meta, activityAt }) => ({
      meta,
      preview: previewFor(meta),
      isActive: meta.sessionId === activeSessionId.value,
      activityAtLabel: intlFormatDistance(activityAt, referenceTime, { locale: locale.value }),
      characterName: cards.value.get(meta.characterId)?.name ?? t('stage.chat.sessions.unknown-character'),
      characterPreview: characterPreviews.value.get(meta.characterId),
    }))
})

/** Every character card, so the filter can pick a character that has no conversation yet. */
const characters = computed(() => [...cards.value].map(([id, card]) => ({ id, name: card.name, preview: characterPreviews.value.get(id) })))

/** Folders in the order of their creation, so a new folder appears last. */
const folders = computed<ChatSessionFolder[]>(() => Object.values(index.value?.folders ?? {})
  .sort((first, second) => first.createdAt - second.createdAt))

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

/**
 * Creates a conversation and opens it. Without a character ID, it belongs to the active character.
 * A folder ID puts the conversation into that folder.
 */
async function startNewSession(payload: { folderId?: string, characterId?: string }) {
  if (isCreatingSession.value)
    return
  isCreatingSession.value = true
  try {
    const characterId = payload.characterId ?? (activeCardId.value || 'default')
    const selectionBeforeCreation = activeSessionId.value
    // Creation runs in the synchronized leader, while navigation belongs to
    // this window. Activating inside createSession would navigate the leader.
    const sessionId = await chatSession.createSession(characterId, { setActive: false })
    if (payload.folderId)
      await chatSession.moveSessionsToFolder([sessionId], payload.folderId)
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

async function renameSession(payload: { sessionId: string, title: string }) {
  if (!await chatSession.renameSession(payload.sessionId, payload.title))
    return

  trackConversationRenamed({
    conversation_id: payload.sessionId,
    source: 'sessions_drawer',
  })
}

async function createFolder(payload: { name: string, sessionIds: string[] }) {
  const folderId = await chatSession.createFolder(payload.name)
  if (folderId && payload.sessionIds.length > 0)
    await chatSession.moveSessionsToFolder(payload.sessionIds, folderId)
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
    :characters="characters"
    :folders="folders"
    :is-desktop="isDesktop"
    :is-creating-session="isCreatingSession"
    :desktop-mode="props.desktopMode"
    @new-session="startNewSession"
    @select-session="selectSession"
    @delete-session="chat.deleteSession"
    @delete-sessions="chat.deleteSessions"
    @rename-session="renameSession"
    @pin-session="chatSession.setSessionPinned($event.sessionId, $event.pinned)"
    @archive-sessions="chatSession.setSessionsArchived($event.sessionIds, $event.archived)"
    @move-sessions="chatSession.moveSessionsToFolder($event.sessionIds, $event.folderId)"
    @create-folder="createFolder"
    @rename-folder="chatSession.renameFolder($event.folderId, $event.name)"
    @delete-folder="chatSession.deleteFolder"
  >
    <template #trigger>
      <slot name="trigger" />
    </template>
  </SessionsDialog>
</template>
