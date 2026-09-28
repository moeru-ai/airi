<script setup lang="ts">
import type { ChatSessionMeta } from '../../../../types/chat-session'
import type { SessionRow } from './sessions-list.vue'

import { errorMessageFrom } from '@moeru/std'
import { Button } from '@proj-airi/ui'
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

const props = withDefaults(defineProps<{
  desktopMode?: 'dialog' | 'popover'
}>(), {
  desktopMode: 'dialog',
})

const showDialog = defineModel({ type: Boolean, default: false, required: false })

const { isDesktop } = useBreakpoints()
const { t, locale } = useI18n()

const chatSession = useChatSessionStore()
const chat = useChatStore()
const { sessionMetas, sessionMessages, activeSessionId } = storeToRefs(chatSession)
const { activeCardId, activeCard } = storeToRefs(useAiriCardStore())
const { userId } = storeToRefs(useAuthStore())
const { activeModel } = storeToRefs(useConsciousnessStore())
const { trackChatSessionSelected, trackChatSessionStarted } = useAnalytics()

// Creating includes persistence and cloud reconciliation, so prevent a
// second click from creating an orphan session while the first is pending.
const isCreatingSession = ref(false)
const scope = ref<'character' | 'unbound'>('character')
const isAssigning = ref(false)
const assignmentError = ref('')
const unboundSessions = computed(() => Object.values(sessionMetas.value).filter(meta => meta.userId === userId.value && meta.characterId === null))
const assignableSession = computed(() => unboundSessions.value.find(meta => meta.sessionId === activeSessionId.value && meta.conversationType === 'bot'))

async function assignSelectedSession() {
  const session = assignableSession.value
  const characterId = activeCardId.value
  const ownerId = userId.value
  if (!session || isAssigning.value)
    return
  isAssigning.value = true
  assignmentError.value = ''
  try {
    await chatSession.assignConversation(session.sessionId, characterId)
    if (userId.value === ownerId && activeCardId.value === characterId && activeSessionId.value === session.sessionId) {
      scope.value = 'character'
      await chatSession.setActiveSession(session.sessionId)
    }
  }
  catch (error) {
    if (userId.value === ownerId && activeCardId.value === characterId && activeSessionId.value === session.sessionId)
      assignmentError.value = errorMessageFrom(error) ?? t('stage.chat.sessions.assignment-failed')
  }
  finally {
    isAssigning.value = false
  }
}

watch([activeCardId, userId], () => {
  scope.value = 'character'
  assignmentError.value = ''
})

// Keep another account's sessions hidden while an account swap rehydrates.
const ownedSessions = computed(() => {
  if (scope.value === 'unbound')
    return unboundSessions.value
  const effectiveUserId = userId.value || 'local'
  return Object.values(sessionMetas.value).filter(meta => meta.userId === effectiveUserId && meta.characterId === activeCardId.value)
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
    const sessionId = await chatSession.createSession(characterId, { setActive: false })
    // Rows remain interactive while creation is persisted in the leader. Do
    // not let that stale continuation replace a newer local user selection.
    if (activeSessionId.value === selectionBeforeCreation && activeCardId.value === characterId)
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

watch([showDialog, activeCardId, scope], async ([open]) => {
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
    :desktop-mode="props.desktopMode"
    @new-session="startNewSession"
    @select-session="selectSession"
    @delete-session="chat.deleteSession"
  >
    <template #scope>
      <div v-if="unboundSessions.length || scope === 'unbound'" :class="['mb-3 flex flex-col gap-2']">
        <div :class="['flex gap-2']">
          <Button :label="activeCard?.name || t('stage.chat.sessions.character')" :aria-pressed="scope === 'character'" @click="scope = 'character'" />
          <Button :label="t('stage.chat.sessions.unbound', { count: unboundSessions.length })" :aria-pressed="scope === 'unbound'" @click="scope = 'unbound'" />
        </div>
        <p v-if="scope === 'unbound'" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
          {{ t('stage.chat.sessions.unbound-description') }}
        </p>
        <Button
          v-if="scope === 'unbound' && assignableSession"
          :label="t('stage.chat.sessions.assign', { name: activeCard?.name })"
          :loading="isAssigning"
          @click="assignSelectedSession"
        />
        <p v-if="assignmentError" role="alert" :class="['text-sm text-red-600 dark:text-red-400']">
          {{ assignmentError }}
        </p>
      </div>
    </template>
    <template #trigger>
      <slot name="trigger" />
    </template>
  </SessionsDialog>
</template>
