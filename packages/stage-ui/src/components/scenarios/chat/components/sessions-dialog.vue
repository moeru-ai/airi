<script setup lang="ts">
import type { SessionRow } from './sessions-list.vue'

import { BottomDrawer } from '@proj-airi/ui'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { useI18n } from 'vue-i18n'

import SessionsList from './sessions-list.vue'

defineProps<{
  open: boolean
  rows: SessionRow[]
  isDesktop: boolean
  isCreatingSession: boolean
}>()

const emit = defineEmits<{
  'deleteSession': [sessionId: string]
  'newSession': []
  'selectSession': [sessionId: string]
  'update:open': [open: boolean]
}>()

const { t } = useI18n()
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
      :rows="rows"
      :is-creating-session="isCreatingSession"
      @new-session="emit('newSession')"
      @select-session="emit('selectSession', $event)"
      @delete-session="emit('deleteSession', $event)"
    />
  </BottomDrawer>
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
          :rows="rows"
          :is-creating-session="isCreatingSession"
          @new-session="emit('newSession')"
          @select-session="emit('selectSession', $event)"
          @delete-session="emit('deleteSession', $event)"
        />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
