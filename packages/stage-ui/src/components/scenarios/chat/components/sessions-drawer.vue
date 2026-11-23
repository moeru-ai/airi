<script setup lang="ts">
import type { ChatSessionFolder, ChatSessionMeta } from '../../../../types/chat-session'
import type { SessionRow } from './session-row-model'

import { errorMessageFrom } from '@moeru/std'
import { useNow } from '@vueuse/core'
import { compareAsc, compareDesc, intlFormatDistance, max } from 'date-fns'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import SessionsDialog from './sessions-dialog.vue'

import { useAnalytics } from '../../../../composables/use-analytics'
import { useBreakpoints } from '../../../../composables/use-breakpoints'
import { useCharacterPreviews } from '../../../../composables/use-character-previews'
import { extractMessageText } from '../../../../libs/chat-sync'
import { useAuthStore } from '../../../../stores/auth'
import { useChatStore } from '../../../../stores/chat'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useChatSessionsViewStore } from '../../../../stores/chat/sessions-view-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../../../stores/modules/consciousness'

const props = withDefaults(defineProps<{
  desktopMode?: 'dialog' | 'popover' | 'inline'
}>(), {
  desktopMode: 'dialog',
})

const showDialog = defineModel({ type: Boolean, default: false, required: false })

/** The folders of a user without folders. One frozen value, so the list sees no change while there are none. */
const NO_FOLDERS: readonly ChatSessionFolder[] = Object.freeze([])

const { isDesktop } = useBreakpoints()
const { t, locale } = useI18n()
const now = useNow({ interval: 60_000 })

const chatSession = useChatSessionStore()
const chat = useChatStore()
const { sessionMetas, sessionMessages, activeSessionId, index } = storeToRefs(chatSession)
const { activeCardId, cards } = storeToRefs(useAiriCardStore())
// The list keeps its place in memory, so a closed and reopened list shows it again.
const { place: listPlace } = storeToRefs(useChatSessionsViewStore())
const characterPreviews = useCharacterPreviews()
const { userId } = storeToRefs(useAuthStore())
const { activeModel } = storeToRefs(useConsciousnessStore())
const { trackChatSessionSelected, trackChatSessionStarted, trackConversationRenamed } = useAnalytics()

// Creating includes persistence and cloud reconciliation, so prevent a
// second click from creating an orphan session while the first is pending.
const isCreatingSession = ref(false)

const effectiveUserId = computed(() => userId.value || 'local')

const currentCharacterId = computed(() => activeCardId.value || 'default')

// The list shows the conversations of the current character only. The user changes the character to see the others.
// Keep another account's sessions hidden while an account swap rehydrates.
// Background recipe sessions are hidden too. Their results reach the conversation as notices.
const ownedSessions = computed(() => Object.values(sessionMetas.value)
  .filter(meta => meta.userId === effectiveUserId.value && !meta.hidden && chatSession.characterMembersOf(meta.sessionId).includes(currentCharacterId.value)))

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

/**
 * Folders in the order of their creation, so a new folder appears last. While an account swap rehydrates, the index
 * can still belong to the other account, so its folders stay hidden, like its sessions.
 */
const folders = computed<readonly ChatSessionFolder[]>(() => {
  const owned = index.value?.userId === effectiveUserId.value ? index.value.folders : undefined
  if (!owned)
    return NO_FOLDERS
  return Object.values(owned).sort((first, second) => compareAsc(first.createdAt, second.createdAt))
})

const rows = computed<SessionRow[]>(() => {
  const referenceTime = max([now.value, Date.now()])
  const folderIds = new Set(folders.value.map(folder => folder.id))
  return ownedSessions.value
    .map(meta => ({ meta, activityAt: activityAtFor(meta) }))
    .sort((first, second) => compareDesc(first.activityAt, second.activityAt))
    .map(({ meta, activityAt }) => ({
      // A conversation is in a folder only while the folder exists. A deleted folder can stay on its record.
      meta: meta.folderId === undefined || folderIds.has(meta.folderId) ? meta : { ...meta, folderId: undefined },
      preview: previewFor(meta),
      isActive: meta.sessionId === activeSessionId.value,
      activityAtLabel: intlFormatDistance(activityAt, referenceTime, { locale: locale.value }),
      characterName: cards.value.get(meta.characterId)?.name ?? t('stage.chat.sessions.unknown-character'),
      characterPreview: characterPreviews.value.get(meta.characterId),
    }))
})

/**
 * Runs an action of the list and explains a failure with a toast, as the other chat controls do. The list keeps its
 * state, so the user can try again.
 */
async function reportFailure(action: () => Promise<unknown>) {
  try {
    await action()
  }
  catch (error) {
    toast.error(t('stage.chat.sessions.save-failed'), { description: errorMessageFrom(error) })
  }
}

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
 * Creates a conversation with the current character and opens it.
 * A folder ID puts the conversation into that folder.
 */
async function startNewSession(payload: { folderId?: string }) {
  if (isCreatingSession.value)
    return
  isCreatingSession.value = true
  try {
    const characterId = currentCharacterId.value
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

/**
 * Archives or restores conversations. When this window shows a conversation that it archives, the window moves to the
 * conversation that the character opens now, as after a deletion.
 */
async function archiveSessions(payload: { sessionIds: string[], archived: boolean }) {
  const shown = sessionMetas.value[activeSessionId.value]
  const opened = await chatSession.setSessionsArchived(payload.sessionIds, payload.archived)
  if (!payload.archived || !shown || !payload.sessionIds.includes(shown.sessionId))
    return
  // The user can select another conversation while the archive saves. That selection stays.
  const next = opened[shown.characterId]
  if (activeSessionId.value === shown.sessionId && next && next !== shown.sessionId)
    await chatSession.setActiveSession(next)
}

async function renameSession(payload: { sessionId: string, title: string }) {
  if (!await chatSession.renameSession(payload.sessionId, payload.title))
    return

  trackConversationRenamed({
    conversation_id: payload.sessionId,
    source: 'sessions_drawer',
  })
}

/**
 * Creates a folder, then moves the conversations into it. With `open`, the list then shows the new folder. A place
 * that the user chose while the folder saved stays.
 */
async function createFolder(payload: { name: string, sessionIds: string[], open: boolean }) {
  const placeBeforeCreation = listPlace.value
  const folderId = await chatSession.createFolder(payload.name)
  if (!folderId)
    return
  if (payload.sessionIds.length > 0)
    await chatSession.moveSessionsToFolder(payload.sessionIds, folderId)
  if (payload.open && listPlace.value === placeBeforeCreation)
    listPlace.value = { kind: 'folder', folderId }
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
    v-model:place="listPlace"
    :rows="rows"
    :folders="folders"
    :is-desktop="isDesktop"
    :is-creating-session="isCreatingSession"
    :desktop-mode="props.desktopMode"
    @new-session="payload => reportFailure(() => startNewSession(payload))"
    @select-session="selectSession"
    @delete-session="sessionId => reportFailure(() => chat.deleteSession(sessionId))"
    @delete-sessions="sessionIds => reportFailure(() => chat.deleteSessions(sessionIds))"
    @rename-session="payload => reportFailure(() => renameSession(payload))"
    @pin-session="payload => reportFailure(() => chatSession.setSessionPinned(payload.sessionId, payload.pinned))"
    @archive-sessions="payload => reportFailure(() => archiveSessions(payload))"
    @move-sessions="payload => reportFailure(() => chatSession.moveSessionsToFolder(payload.sessionIds, payload.folderId))"
    @create-folder="payload => reportFailure(() => createFolder(payload))"
    @rename-folder="payload => reportFailure(() => chatSession.renameFolder(payload.folderId, payload.name))"
    @delete-folder="folderId => reportFailure(() => chatSession.deleteFolder(folderId))"
  >
    <template #trigger>
      <slot name="trigger" />
    </template>
  </SessionsDialog>
</template>
