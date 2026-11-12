<script setup lang="ts">
import type { SessionRow } from './sessions-list.vue'

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
  desktopMode?: 'dialog' | 'popover'
}>(), {
  desktopMode: 'dialog',
})

const emit = defineEmits<{
  'deleteSession': [sessionId: string]
  'deleteSessions': [sessionIds: string[]]
  'newSession': []
  'renameSession': [payload: { sessionId: string, title: string }]
  'selectSession': [sessionId: string]
  'update:open': [open: boolean]
}>()

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
    @update:model-value="emit('update:open', $event)"
  >
    <template v-if="$slots.trigger" #trigger>
      <slot name="trigger" />
    </template>
    <SessionsList
      v-model:selecting="selecting"
      :rows="rows"
      :is-creating-session="isCreatingSession"
      @new-session="emit('newSession')"
      @rename-session="emit('renameSession', $event)"
      @select-session="emit('selectSession', $event)"
      @delete-session="emit('deleteSession', $event)"
      @delete-sessions="emit('deleteSessions', $event)"
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
          compact
          :rows="rows"
          :is-creating-session="isCreatingSession"
          @new-session="emit('newSession')"
          @rename-session="emit('renameSession', $event)"
          @select-session="emit('selectSession', $event)"
          @delete-session="emit('deleteSession', $event)"
          @delete-sessions="emit('deleteSessions', $event)"
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
        <DialogTitle :class="['mb-5 text-xl font-semibold tracking-tight']">
          {{ t('stage.chat.sessions.title') }}
        </DialogTitle>
        <SessionsList
          v-model:selecting="selecting"
          :rows="rows"
          :is-creating-session="isCreatingSession"
          @new-session="emit('newSession')"
          @rename-session="emit('renameSession', $event)"
          @select-session="emit('selectSession', $event)"
          @delete-session="emit('deleteSession', $event)"
          @delete-sessions="emit('deleteSessions', $event)"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
