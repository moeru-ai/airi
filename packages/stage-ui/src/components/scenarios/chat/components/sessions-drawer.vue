<script setup lang="ts">
import type { ChatSessionMeta } from '../../../../types/chat-session'
import type { SessionRow } from './session-row-model'

import { errorMessageFrom } from '@moeru/std'
import { useNow } from '@vueuse/core'
import { compareDesc, intlFormatDistance, max } from 'date-fns'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import SessionsDialog from './sessions-dialog.vue'

import { useAnalytics } from '../../../../composables/use-analytics'
import { useBreakpoints } from '../../../../composables/use-breakpoints'
import { extractMessageText } from '../../../../libs/chat-sync'
import { useAuthStore } from '../../../../stores/auth'
import { useChatStore } from '../../../../stores/chat'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useChatSessionsViewStore } from '../../../../stores/chat/sessions-view-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../../../stores/modules/consciousness'

const props = withDefaults(defineProps<{
  desktopMode?: 'dialog' | 'popover' | 'inline'
  /** The host is a desktop window. A narrow desktop window then keeps the desktop surfaces and never shows the phone drawer. */
  desktop?: boolean
}>(), {
  desktopMode: 'dialog',
  desktop: false,
})

const emit = defineEmits<{
  /** The user asked for the settings of the character. The host opens them, because each app opens settings its own way. */
  openCharacterSettings: [characterId: string]
}>()

const showDialog = defineModel({ type: Boolean, default: false, required: false })


const { isDesktop } = useBreakpoints()
const { t, locale } = useI18n()
const now = useNow({ interval: 60_000 })

const chatSession = useChatSessionStore()
const chat = useChatStore()
const { sessionMetas, sessionMessages, activeSessionId } = storeToRefs(chatSession)
const { activeCardId, cards } = storeToRefs(useAiriCardStore())
// The list keeps its place in memory, so a closed and reopened list shows it again.
const { place: listPlace } = storeToRefs(useChatSessionsViewStore())
const { userId } = storeToRefs(useAuthStore())
const { activeModel } = storeToRefs(useConsciousnessStore())
const { trackChatSessionSelected, trackChatSessionStarted, trackConversationRenamed } = useAnalytics()

// Creating includes persistence and cloud reconciliation, so prevent a
// second click from creating an orphan session while the first is pending.
const isCreatingSession = ref(false)

const effectiveUserId = computed(() => userId.value || 'local')

const currentCharacterId = computed(() => activeCardId.value || 'default')
/** The current character, for the title of a list that stands beside the chat. */
const currentCharacter = computed(() => {
  const card = cards.value.get(currentCharacterId.value)
  return card ? { name: card.name } : undefined
})

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

/**
 * The last message of a conversation for the second line of its row. The words of the user carry a prefix, as in a
 * messenger. A conversation whose messages are not loaded yet has none.
 */
function lastMessageFor(meta: ChatSessionMeta): string | undefined {
  const messages = sessionMessages.value[meta.sessionId] ?? []
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.role !== 'user' && message.role !== 'assistant')
      continue
    const text = extractMessageText(message).replace(/\s+/g, ' ').trim()
    if (!text)
      continue
    const short = text.length > 80 ? `${text.slice(0, 80)}…` : text
    return message.role === 'user' ? t('stage.chat.sessions.last-message-you', { text: short }) : short
  }
  return undefined
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
  const referenceTime = max([now.value, Date.now()])
  return ownedSessions.value
    .map(meta => ({ meta, activityAt: activityAtFor(meta) }))
    .sort((first, second) => compareDesc(first.activityAt, second.activityAt))
    .map(({ meta, activityAt }) => ({
      meta,
      preview: previewFor(meta),
      lastMessage: lastMessageFor(meta),
      isActive: meta.sessionId === activeSessionId.value,
      activityAtLabel: intlFormatDistance(activityAt, referenceTime, { locale: locale.value }),
      characterName: cards.value.get(meta.characterId)?.name ?? t('stage.chat.sessions.unknown-character'),
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
 */
async function startNewSession() {
  if (isCreatingSession.value)
    return
  isCreatingSession.value = true
  try {
    const characterId = currentCharacterId.value
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

// Per-open generation counter. The batch loadSession loop checks this before
// each batch so closing the drawer mid-load aborts cleanly instead of
// continuing to hydrate sessions the user has navigated away from. Without
// this, a session deleted from outside while the batch was running could be
// re-added to `loadedSessions` as a phantom entry.
let openGeneration = 0

// The inline list is always shown, so it loads the messages when it mounts and when its conversations change, for
// example after the index loads or the character changes. A loaded conversation returns at once.
const listShown = computed(() => showDialog.value || props.desktopMode === 'inline')
const ownedSessionKey = computed(() => ownedSessions.value.map(meta => meta.sessionId).join('\n'))

watch([listShown, ownedSessionKey], async ([open]) => {
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
    if (myGeneration !== openGeneration || !listShown.value)
      return
    await Promise.all(knownSessionIds.slice(i, i + batchSize).map(id => chatSession.loadSession(id)))
  }
}, { immediate: true })
</script>

<template>
  <SessionsDialog
    v-model:open="showDialog"
    v-model:place="listPlace"
    :rows="rows"
    :is-desktop="props.desktop || isDesktop"
    :is-creating-session="isCreatingSession"
    :desktop-mode="props.desktopMode"
    :character="currentCharacter"
    @open-character="emit('openCharacterSettings', currentCharacterId)"
    @new-session="reportFailure(startNewSession)"
    @select-session="selectSession"
    @delete-session="sessionId => reportFailure(() => chat.deleteSession(sessionId))"
    @delete-sessions="sessionIds => reportFailure(() => chat.deleteSessions(sessionIds))"
    @rename-session="payload => reportFailure(() => renameSession(payload))"
    @pin-session="payload => reportFailure(() => chatSession.setSessionPinned(payload.sessionId, payload.pinned))"
    @archive-sessions="payload => reportFailure(() => archiveSessions(payload))"
  >
    <template #trigger>
      <slot name="trigger" />
    </template>
  </SessionsDialog>
</template>
