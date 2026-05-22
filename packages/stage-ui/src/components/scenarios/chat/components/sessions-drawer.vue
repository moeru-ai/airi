<script setup lang="ts">
import type { ChatSessionMeta } from '../../../../types/chat-session'

import { useResizeObserver, useScreenSafeArea } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { DrawerContent, DrawerHandle, DrawerOverlay, DrawerPortal, DrawerRoot, DrawerTitle } from 'vaul-vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAnalytics } from '../../../../composables/use-analytics'
import { useBreakpoints } from '../../../../composables/use-breakpoints'
import { extractMessageText } from '../../../../libs/chat-sync'
import { useAuthStore } from '../../../../stores/auth'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useAiriCardStore } from '../../../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../../../stores/modules/consciousness'

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
const { trackChatSessionStarted } = useAnalytics()

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

async function selectSession(sessionId: string) {
  chatSession.setActiveSession(sessionId)
  showDialog.value = false
}

async function startNewSession() {
  if (isCreatingSession.value)
    return
  isCreatingSession.value = true
  try {
    const characterId = activeCardId.value || 'default'
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

async function deleteRow(event: Event, sessionId: string) {
  // Stop the parent button's click — otherwise we'd switch into the session
  // we are about to remove and immediately need a fallback.
  event.stopPropagation()
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
  <DialogRoot v-if="isDesktop" :open="showDialog" @update:open="value => showDialog = value">
    <slot name="trigger" />
    <DialogPortal>
      <DialogOverlay
        :class="[
          'fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm',
          'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
        ]"
      />
      <DialogContent
        :class="[
          'fixed left-1/2 top-1/2 z-[9999] max-h-[80dvh] max-w-md w-[92dvw] transform overflow-hidden rounded-2xl bg-white/95 shadow-xl outline-none backdrop-blur-md scrollbar-none -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow dark:bg-neutral-900/90',
        ]"
      >
        <div :class="['flex flex-col h-full max-h-[80dvh]']">
          <div :class="['flex items-center justify-between px-5 pt-5 pb-3']">
            <DialogTitle :class="['text-base font-medium text-neutral-700 dark:text-neutral-200']">
              {{ t('stage.chat.sessions.title') }}
            </DialogTitle>
            <button
              :class="[
                'rounded-lg px-3 py-1.5 text-xs font-medium',
                'bg-primary-100/60 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
                'hover:bg-primary-200/70 dark:hover:bg-primary-800/50',
                'transition-colors',
              ]"
              :disabled="isCreatingSession"
              @click="startNewSession"
            >
              {{ t('stage.chat.sessions.new') }}
            </button>
          </div>
          <div :class="['flex-1 overflow-y-auto px-2 pb-4']">
            <div v-if="rows.length === 0" :class="['p-6 text-center text-sm text-neutral-500 dark:text-neutral-400']">
              {{ t('stage.chat.sessions.empty') }}
            </div>
            <div
              v-for="row in rows"
              :key="row.meta.sessionId"
              :class="[
                'group relative w-full rounded-xl mb-1',
                'transition-colors',
                row.isActive
                  ? 'bg-primary-100/70 dark:bg-primary-900/40'
                  : 'hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60',
              ]"
            >
              <button
                :class="['w-full text-left px-3 py-2.5 outline-none flex flex-col gap-1']"
                @click="selectSession(row.meta.sessionId)"
              >
                <div :class="['flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200']">
                  <span :class="['truncate flex-1']">{{ row.preview }}</span>
                  <span
                    v-if="row.meta.cloudChatId"
                    :class="['shrink-0 text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5', 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300']"
                    :title="t('stage.chat.sessions.cloud-badge')"
                  >
                    cloud
                  </span>
                  <!-- placeholder for trash icon to reserve hit space -->
                  <span :class="['w-7']" />
                </div>
                <div :class="['text-[11px] text-neutral-500 dark:text-neutral-400']">
                  {{ row.updatedAtLabel }}
                </div>
              </button>
              <button
                :class="[
                  'absolute right-2 top-2 h-7 w-7 flex items-center justify-center rounded-md',
                  'opacity-0 group-hover:opacity-100 focus:opacity-100',
                  'text-neutral-400 hover:text-red-500 hover:bg-red-500/10',
                  'transition-opacity duration-150',
                ]"
                :title="t('stage.chat.sessions.delete')"
                @click="deleteRow($event, row.meta.sessionId)"
              >
                <div class="i-solar:trash-bin-trash-bold-duotone h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
  <DrawerRoot v-else :open="showDialog" should-scale-background @update:open="value => showDialog = value">
    <DrawerPortal>
      <DrawerOverlay :class="['fixed inset-0']" />
      <DrawerContent
        :class="[
          'fixed bottom-0 left-0 right-0 z-1000',
          'mt-20 px-2 pt-3',
          'flex flex-col',
          'h-full max-h-[85%]',
          'rounded-t-[32px] outline-none backdrop-blur-md',
          'bg-neutral-50/95 dark:bg-neutral-900/95',
        ]"
        :style="{ paddingBottom: `${Math.max(Number.parseFloat(screenSafeArea.bottom.value.replace('px', '')), 24)}px` }"
      >
        <DrawerHandle :class="['[div&]:bg-neutral-400 [div&]:dark:bg-neutral-600']" />
        <div :class="['flex items-center justify-between px-4 pt-3 pb-2']">
          <DrawerTitle :class="['text-base font-medium text-neutral-700 dark:text-neutral-200']">
            {{ t('stage.chat.sessions.title') }}
          </DrawerTitle>
          <button
            :class="[
              'rounded-lg px-3 py-1.5 text-xs font-medium',
              'bg-primary-100/60 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
              'hover:bg-primary-200/70 dark:hover:bg-primary-800/50',
              'transition-colors',
            ]"
            :disabled="isCreatingSession"
            @click="startNewSession"
          >
            {{ t('stage.chat.sessions.new') }}
          </button>
        </div>
        <div :class="['flex-1 overflow-y-auto px-2 pb-2']">
          <div v-if="rows.length === 0" :class="['p-6 text-center text-sm text-neutral-500 dark:text-neutral-400']">
            {{ t('stage.chat.sessions.empty') }}
          </div>
          <div
            v-for="row in rows"
            :key="row.meta.sessionId"
            :class="[
              'group relative w-full rounded-xl mb-1',
              'transition-colors',
              row.isActive
                ? 'bg-primary-100/70 dark:bg-primary-900/40'
                : 'hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60',
            ]"
          >
            <button
              :class="['w-full text-left px-3 py-3 outline-none flex flex-col gap-1']"
              @click="selectSession(row.meta.sessionId)"
            >
              <div :class="['flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200']">
                <span :class="['truncate flex-1']">{{ row.preview }}</span>
                <span
                  v-if="row.meta.cloudChatId"
                  :class="['shrink-0 text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5', 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300']"
                  :title="t('stage.chat.sessions.cloud-badge')"
                >
                  cloud
                </span>
                <span :class="['w-7']" />
              </div>
              <div :class="['text-[11px] text-neutral-500 dark:text-neutral-400']">
                {{ row.updatedAtLabel }}
              </div>
            </button>
            <button
              :class="[
                'absolute right-2 top-2 h-7 w-7 flex items-center justify-center rounded-md',
                'opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100',
                'text-neutral-400 hover:text-red-500 hover:bg-red-500/10',
                'transition-opacity duration-150',
              ]"
              :title="t('stage.chat.sessions.delete')"
              @click="deleteRow($event, row.meta.sessionId)"
            >
              <div class="i-solar:trash-bin-trash-bold-duotone h-4 w-4" />
            </button>
          </div>
        </div>
      </DrawerContent>
    </DrawerPortal>
  </DrawerRoot>
</template>
