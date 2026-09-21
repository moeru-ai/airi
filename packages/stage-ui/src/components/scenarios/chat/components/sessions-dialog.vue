<script setup lang="ts">
import type { SessionRow } from './sessions-list.vue'

import { BasicButton, BottomDrawer } from '@proj-airi/ui'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { useI18n } from 'vue-i18n'

import SessionsList from './sessions-list.vue'

withDefaults(defineProps<{
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
  'newSession': []
  'selectSession': [sessionId: string]
  'update:open': [open: boolean]
}>()

const { t } = useI18n()

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
      :rows="rows"
      :is-creating-session="isCreatingSession"
      @new-session="emit('newSession')"
      @select-session="emit('selectSession', $event)"
      @delete-session="emit('deleteSession', $event)"
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
        <BasicButton
          block
          size="unset"
          :class="[
            'new-session-action h-9 rounded-lg px-2 text-sm text-primary-600 outline-none',
            'hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-950/70',
            'focus-visible:outline-2 focus-visible:outline-primary-500 focus-visible:outline-offset-[-2px]',
          ]"
          :loading="isCreatingSession"
          @click="emit('newSession')"
        >
          <span aria-hidden="true" :class="['i-solar:add-circle-outline size-4.5']" />
          {{ t('stage.chat.sessions.new') }}
        </BasicButton>
        <div :class="['my-1 h-px bg-neutral-200/70 dark:bg-neutral-700/70']" />
        <SessionsList
          compact
          :show-new-session="false"
          :rows="rows"
          :is-creating-session="isCreatingSession"
          @new-session="emit('newSession')"
          @select-session="emit('selectSession', $event)"
          @delete-session="emit('deleteSession', $event)"
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

<style scoped>
.new-session-action :deep(.basic-button-content) {
  width: 100%;
  justify-content: flex-start;
}
</style>
