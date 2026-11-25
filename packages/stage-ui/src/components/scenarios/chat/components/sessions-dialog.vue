<script setup lang="ts">
import type { ChatSessionsPlace } from '../../../../types/chat-session'
import type { SessionRow } from './session-row-model'

import { BottomDrawer } from '@proj-airi/ui'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionsList from './sessions-list.vue'

const props = withDefaults(defineProps<{
  open: boolean
  rows: SessionRow[]
  isDesktop: boolean
  isCreatingSession: boolean
  /**
   * `inline` renders the list in place, without a surface, and ignores `open`. A window that keeps the list beside the
   * chat uses it. `floating` renders it in place too, with its actions in islands, for the floating chat.
   */
  desktopMode?: 'dialog' | 'popover' | 'inline' | 'floating'
  /** The character of the conversations. The inline list names it in its title. */
  character?: { name: string }
  /** The inline list is on a touch screen, so its rows take swipes and long presses. */
  touch?: boolean
  /** The owner reads stored messages for the search. See `SessionsList`. */
  searching?: boolean
}>(), {
  desktopMode: 'dialog',
  touch: false,
})

const emit = defineEmits<{
  'deleteSession': [sessionId: string]
  'deleteSessions': [sessionIds: string[]]
  'newSession': []
  'renameSession': [payload: { sessionId: string, title: string }]
  'selectSession': [sessionId: string]
  'pinSession': [payload: { sessionId: string, pinned: boolean }]
  'archiveSessions': [payload: { sessionIds: string[], archived: boolean }]
  'update:open': [open: boolean]
  'openCharacter': []
}>()

/** The place of the list. The owner can keep it, so the list opens where the user left it. */
const place = defineModel<ChatSessionsPlace>('place', { default: () => ({ kind: 'all' }) })
/** The search of the list. The owner filters the rows by it. */
const query = defineModel<string>('query', { default: '' })

const { t } = useI18n()
// Every open starts outside selection mode, so a closed list never keeps a selection.
const selecting = shallowRef(false)

watch(() => props.open, (open) => {
  if (!open)
    selecting.value = false
})

function preserveTriggerFocus(event: Event) {
  event.preventDefault()
}
</script>

<template>
  <div v-if="desktopMode === 'inline' || desktopMode === 'floating'" data-testid="sessions-inline" :class="['h-full min-h-0 py-2 pl-2']">
    <SessionsList
      v-model:selecting="selecting"
      v-model:place="place"
      v-model:query="query"
      :searching="searching"
      compact
      fill
      :islands="desktopMode === 'floating'"
      :touch="touch"
      :character="character"
      :class="['h-full']"
      :rows="rows"
      :is-creating-session="isCreatingSession"
      @open-character="emit('openCharacter')"
      @new-session="emit('newSession')"
      @rename-session="emit('renameSession', $event)"
      @select-session="emit('selectSession', $event)"
      @delete-session="emit('deleteSession', $event)"
      @delete-sessions="emit('deleteSessions', $event)"
      @pin-session="emit('pinSession', $event)"
      @archive-sessions="emit('archiveSessions', $event)"
    />
  </div>
  <BottomDrawer
    v-else-if="!isDesktop"
    :model-value="open"
    :title="t('stage.chat.sessions.title')"
    minimum-height="half"
    hide-title
    @update:model-value="emit('update:open', $event)"
  >
    <template v-if="$slots.trigger" #trigger>
      <slot name="trigger" />
    </template>
    <SessionsList
      v-model:selecting="selecting"
      v-model:place="place"
      v-model:query="query"
      :searching="searching"
      :rows="rows"
      :is-creating-session="isCreatingSession"
      @new-session="emit('newSession')"
      @rename-session="emit('renameSession', $event)"
      @select-session="emit('selectSession', $event)"
      @delete-session="emit('deleteSession', $event)"
      @delete-sessions="emit('deleteSessions', $event)"
      @pin-session="emit('pinSession', $event)"
      @archive-sessions="emit('archiveSessions', $event)"
    />
  </BottomDrawer>
  <PopoverRoot v-else-if="desktopMode === 'popover'" :open="open" @update:open="emit('update:open', $event)">
    <PopoverTrigger v-if="$slots.trigger" as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side-offset="8"
        align="start"
        :class="[
          'z-[9999] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-neutral-200/80 p-1.5 shadow-lg outline-none',
          'bg-white/95 text-neutral-900 backdrop-blur-xl dark:border-neutral-700/70 dark:bg-neutral-900/95 dark:text-neutral-100',
          'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
        ]"
        @open-auto-focus="preserveTriggerFocus"
      >
        <SessionsList
          v-model:selecting="selecting"
          v-model:place="place"
          v-model:query="query"
          :searching="searching"
          compact
          :rows="rows"
          :is-creating-session="isCreatingSession"
          @new-session="emit('newSession')"
          @rename-session="emit('renameSession', $event)"
          @select-session="emit('selectSession', $event)"
          @delete-session="emit('deleteSession', $event)"
          @delete-sessions="emit('deleteSessions', $event)"
          @pin-session="emit('pinSession', $event)"
          @archive-sessions="emit('archiveSessions', $event)"
        />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
  <DialogRoot v-else :open="open" @update:open="emit('update:open', $event)">
    <slot name="trigger" />
    <DialogPortal>
      <DialogOverlay
        :class="['fixed inset-0 z-[9999] bg-black/35', 'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn']"
      />
      <DialogContent
        :aria-describedby="undefined"
        :class="[
          'pointer-events-auto fixed left-1/2 top-1/2 z-[9999] max-h-[80dvh] max-w-md w-[92dvw] flex flex-col rounded-3xl p-5',
          '-translate-x-1/2 -translate-y-1/2 bg-neutral-50 text-neutral-900 shadow-xl outline-none dark:bg-neutral-900 dark:text-neutral-100',
          'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
        ]"
      >
        <!-- The list shows the visible title, because it switches between all conversations and the archive. -->
        <DialogTitle :class="['sr-only']">
          {{ t('stage.chat.sessions.title') }}
        </DialogTitle>
        <SessionsList
          v-model:selecting="selecting"
          v-model:place="place"
          v-model:query="query"
          :searching="searching"
          :rows="rows"
          :is-creating-session="isCreatingSession"
          @new-session="emit('newSession')"
          @rename-session="emit('renameSession', $event)"
          @select-session="emit('selectSession', $event)"
          @delete-session="emit('deleteSession', $event)"
          @delete-sessions="emit('deleteSessions', $event)"
          @pin-session="emit('pinSession', $event)"
          @archive-sessions="emit('archiveSessions', $event)"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
