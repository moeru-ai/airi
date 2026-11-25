<script setup lang="ts">
import type { ChatHistoryItem } from '../../../../types/chat'
import type { ChatSessionMeta, ChatSessionSummary } from '../../../../types/chat-session'
import type { SessionRow } from './session-row-model'

import { errorMessageFrom } from '@moeru/std'
import { useNow } from '@vueuse/core'
import { compareDesc, max } from 'date-fns'
import { storeToRefs } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import SessionsDialog from './sessions-dialog.vue'

import { useAnalytics } from '../../../../composables/use-analytics'
import { useBreakpoints } from '../../../../composables/use-breakpoints'
import { chatSessionsRepo } from '../../../../database/repos/chat-sessions.repo'
import { useAuthStore } from '../../../../stores/auth'
import { useChatStore } from '../../../../stores/chat'
import { normalizeSessionQuery, searchSessions } from '../../../../stores/chat/session-search'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { chatNameOf, chatSummaryOf } from '../../../../stores/chat/session-summary'
import { useChatSessionsViewStore } from '../../../../stores/chat/sessions-view-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../../../stores/modules/consciousness'
import { formatSessionFullTime, formatSessionRowTime } from './session-time'

const props = withDefaults(defineProps<{
  /** Where the list shows. See `SessionsDialog`. */
  desktopMode?: 'dialog' | 'popover' | 'inline' | 'floating'
  /** The host is a desktop window. A narrow desktop window then keeps the desktop surfaces and never shows the phone drawer. */
  desktop?: boolean
  /** The inline list is on a touch screen, for example in the side drawer of the phone. */
  touch?: boolean
  /**
   * The character whose chats the list shows. A list beside a character rail shows the character that the rail picks.
   * Without it, the list shows the chats of the character on the stage.
   */
  characterId?: string
}>(), {
  desktopMode: 'dialog',
  desktop: false,
  touch: false,
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

const currentCharacterId = computed(() => props.characterId ?? (activeCardId.value || 'default'))
/** The character of the list, for its title, its new-chat button, and its empty state. */
const currentCharacter = computed(() => {
  const card = cards.value.get(currentCharacterId.value)
  return card ? { name: card.name } : undefined
})

// The list shows the conversations of one character only. A character rail beside the list picks the others.
// Keep another account's sessions hidden while an account swap rehydrates.
// Background recipe sessions are hidden too. Their results reach the conversation as notices.
const ownedSessions = computed(() => Object.values(sessionMetas.value)
  .filter(meta => meta.userId === effectiveUserId.value && !meta.hidden && chatSession.characterMembersOf(meta.sessionId).includes(currentCharacterId.value)))

/** The summary of a conversation for its row. The list reads stored summaries, so it needs no message records. */
function summaryFor(meta: ChatSessionMeta): ChatSessionSummary {
  return chatSummaryOf(meta, sessionMessages.value[meta.sessionId])
}

/** The title of a row: the name of the conversation, else the fallback for a conversation without one. */
function previewFor(meta: ChatSessionMeta, summary: ChatSessionSummary): string {
  return chatNameOf(meta, summary) ?? t('stage.chat.sessions.new-chat-fallback')
}

/** The second line of a row. The words of the user carry a prefix, as in a messenger. */
function lastMessageFor(summary: ChatSessionSummary): string | undefined {
  if (!summary.lastText)
    return undefined
  return summary.lastFromUser ? t('stage.chat.sessions.last-message-you', { text: summary.lastText }) : summary.lastText
}

/**
 * The search of the list. The list sets it when the typing pauses, and the rows below show only the conversations that
 * match it.
 */
const searchQuery = ref('')
const searchActive = computed(() => normalizeSessionQuery(searchQuery.value) !== '')

/**
 * The stored messages of conversations that are not loaded, read for the search. Each entry keeps the `updatedAt` of
 * the metadata that it was read with, so a conversation that changed since then is read again. The cache lives while
 * the search does, and an empty search drops it.
 */
const storedMessages = shallowRef(new Map<string, { updatedAt: number, messages?: ChatHistoryItem[] }>())
const searchLoading = shallowRef(false)
// Each read of the stored messages has a number. A read that a newer read or an empty search replaced is dropped.
let searchRead = 0

watch([searchActive, ownedSessions], async ([active, metas]) => {
  const read = ++searchRead
  if (!active) {
    storedMessages.value = new Map()
    searchLoading.value = false
    return
  }
  const missing = metas.filter(meta => !sessionMessages.value[meta.sessionId]?.length
    && storedMessages.value.get(meta.sessionId)?.updatedAt !== meta.updatedAt)
  if (missing.length === 0)
    return
  searchLoading.value = true
  try {
    const records = await Promise.all(missing.map(async meta => ({
      meta,
      messages: await chatSessionsRepo.getSessionMessages(meta.sessionId),
    })))
    if (read !== searchRead)
      return
    const next = new Map(storedMessages.value)
    for (const { meta, messages } of records)
      next.set(meta.sessionId, { updatedAt: meta.updatedAt, messages })
    storedMessages.value = next
  }
  catch (error) {
    // The search still matches titles and loaded conversations, so a failed read only narrows the results.
    toast.error(t('stage.chat.sessions.search-failed'), { description: errorMessageFrom(error) })
  }
  finally {
    if (read === searchRead)
      searchLoading.value = false
  }
}, { immediate: true })

/** The conversations that match the search, with the reason of each match. Loaded messages win over stored ones. */
const searchMatches = computed(() => {
  if (!searchActive.value)
    return undefined
  return searchSessions(searchQuery.value, ownedSessions.value.map((meta) => {
    const loaded = sessionMessages.value[meta.sessionId]
    return {
      sessionId: meta.sessionId,
      title: previewFor(meta, summaryFor(meta)),
      messages: loaded?.length ? loaded : storedMessages.value.get(meta.sessionId)?.messages,
    }
  }))
})

const rows = computed<SessionRow[]>(() => {
  const referenceTime = max([now.value, Date.now()])
  const matches = searchMatches.value
  return ownedSessions.value
    .filter(meta => !matches || matches.has(meta.sessionId))
    .map((meta) => {
      const summary = summaryFor(meta)
      return { meta, summary, activityAt: summary.lastAt ?? meta.createdAt }
    })
    .sort((first, second) => compareDesc(first.activityAt, second.activityAt))
    .map(({ meta, summary, activityAt }) => ({
      meta,
      preview: previewFor(meta, summary),
      lastMessage: lastMessageFor(summary),
      isActive: meta.sessionId === activeSessionId.value,
      activityAt,
      activityAtLabel: formatSessionRowTime(activityAt, referenceTime, locale.value),
      activityAtTitle: formatSessionFullTime(activityAt, locale.value),
      characterName: cards.value.get(meta.characterId)?.name ?? t('stage.chat.sessions.unknown-character'),
      match: matches?.get(meta.sessionId),
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

// A list that closes ends its search, so the next open shows every conversation again.
watch(showDialog, (open) => {
  if (!open)
    searchQuery.value = ''
})

/**
 * Creates a conversation with the character of the list and opens it. Opening it makes that character the active
 * character, as opening any of its conversations does.
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
</script>

<template>
  <SessionsDialog
    v-model:open="showDialog"
    v-model:place="listPlace"
    v-model:query="searchQuery"
    :rows="rows"
    :is-desktop="props.desktop || isDesktop"
    :is-creating-session="isCreatingSession"
    :searching="searchLoading"
    :desktop-mode="props.desktopMode"
    :touch="props.touch"
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
