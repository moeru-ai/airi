<script setup lang="ts">
import type { ChatSessionFolder, ChatSessionsPlace } from '../../../../types/chat-session'
import type { SessionRow } from './session-row-model'

import { BottomDrawer } from '@proj-airi/ui'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionsList from './sessions-list.vue'

const props = withDefaults(defineProps<{
  open: boolean
  rows: SessionRow[]
  characters: Array<{ id: string, name: string, preview?: string }>
  folders: readonly ChatSessionFolder[]
  isDesktop: boolean
  isCreatingSession: boolean
  desktopMode?: 'dialog' | 'popover'
}>(), {
  desktopMode: 'dialog',
})

const emit = defineEmits<{
  'deleteSession': [sessionId: string]
  'deleteSessions': [sessionIds: string[]]
  'newSession': [payload: { folderId?: string, characterId?: string }]
  'renameSession': [payload: { sessionId: string, title: string }]
  'selectSession': [sessionId: string]
  'pinSession': [payload: { sessionId: string, pinned: boolean }]
  'archiveSessions': [payload: { sessionIds: string[], archived: boolean }]
  'moveSessions': [payload: { sessionIds: string[], folderId: string | undefined }]
  'createFolder': [payload: { name: string, sessionIds: string[], open: boolean }]
  'renameFolder': [payload: { folderId: string, name: string }]
  'deleteFolder': [folderId: string]
  'update:open': [open: boolean]
}>()

/** The place and the character of the list. The owner can keep them, so the list opens where the user left it. */
const place = defineModel<ChatSessionsPlace>('place', { default: () => ({ kind: 'all' }) })
const characterId = defineModel<string>('characterId')

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
  <BottomDrawer
    v-if="!isDesktop"
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
      v-model:character-id="characterId"
      :rows="rows"
      :characters="characters"
      :folders="folders"
      :is-creating-session="isCreatingSession"
      @new-session="emit('newSession', $event)"
      @rename-session="emit('renameSession', $event)"
      @select-session="emit('selectSession', $event)"
      @delete-session="emit('deleteSession', $event)"
      @delete-sessions="emit('deleteSessions', $event)"
      @pin-session="emit('pinSession', $event)"
      @archive-sessions="emit('archiveSessions', $event)"
      @move-sessions="emit('moveSessions', $event)"
      @create-folder="emit('createFolder', $event)"
      @rename-folder="emit('renameFolder', $event)"
      @delete-folder="emit('deleteFolder', $event)"
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
          v-model:character-id="characterId"
          compact
          :rows="rows"
          :characters="characters"
          :folders="folders"
          :is-creating-session="isCreatingSession"
          @new-session="emit('newSession', $event)"
          @rename-session="emit('renameSession', $event)"
          @select-session="emit('selectSession', $event)"
          @delete-session="emit('deleteSession', $event)"
          @delete-sessions="emit('deleteSessions', $event)"
          @pin-session="emit('pinSession', $event)"
          @archive-sessions="emit('archiveSessions', $event)"
          @move-sessions="emit('moveSessions', $event)"
          @create-folder="emit('createFolder', $event)"
          @rename-folder="emit('renameFolder', $event)"
          @delete-folder="emit('deleteFolder', $event)"
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
        <!-- The list shows the visible title, because it switches between all conversations, a folder, and the archive. -->
        <DialogTitle :class="['sr-only']">
          {{ t('stage.chat.sessions.title') }}
        </DialogTitle>
        <SessionsList
          v-model:selecting="selecting"
          v-model:place="place"
          v-model:character-id="characterId"
          :rows="rows"
          :characters="characters"
          :folders="folders"
          :is-creating-session="isCreatingSession"
          @new-session="emit('newSession', $event)"
          @rename-session="emit('renameSession', $event)"
          @select-session="emit('selectSession', $event)"
          @delete-session="emit('deleteSession', $event)"
          @delete-sessions="emit('deleteSessions', $event)"
          @pin-session="emit('pinSession', $event)"
          @archive-sessions="emit('archiveSessions', $event)"
          @move-sessions="emit('moveSessions', $event)"
          @create-folder="emit('createFolder', $event)"
          @rename-folder="emit('renameFolder', $event)"
          @delete-folder="emit('deleteFolder', $event)"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
