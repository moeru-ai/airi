<script setup lang="ts">
import type { SessionRow } from './sessions-list.vue'

import { BottomDrawer, GhostButton } from '@proj-airi/ui'
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import SessionFeatureSettings from './session-feature-settings.vue'
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
const selecting = shallowRef(false)
const editingSessionId = shallowRef<string>()
const triggerHost = useTemplateRef<HTMLElement>('triggerHost')
watch(() => props.open, (open) => {
  if (!open) {
    selecting.value = false
    editingSessionId.value = undefined
  }
})

function preserveTriggerFocus(event: Event) {
  event.preventDefault()
}

async function restoreTriggerFocus(event: Event) {
  event.preventDefault()
  // Opening the editor transfers focus into its modal.
  if (props.open)
    return
  await nextTick()
  triggerHost.value?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
}
</script>

<template>
  <div ref="triggerHost" :class="['contents']">
    <BottomDrawer
      v-if="!isDesktop"
      :model-value="open"
      :title="editingSessionId ? t('settings.session-features.session-title') : t('stage.chat.sessions.title')"
      :hide-title="!!editingSessionId"
      minimum-height="half"
      @update:model-value="emit('update:open', $event)"
    >
      <template v-if="$slots.trigger" #trigger>
        <slot name="trigger" />
      </template>
      <SessionFeatureSettings
        v-if="editingSessionId" :session-id="editingSessionId"
      >
        <template #title>
          <h2 aria-hidden="true" :class="['text-xl font-semibold tracking-tight']">
            {{ t('settings.session-features.session-title') }}
          </h2>
        </template>
      </SessionFeatureSettings>
      <SessionsList
        v-else
        v-model:selecting="selecting"
        :rows="rows"
        :is-creating-session="isCreatingSession"
        @configure-session="editingSessionId = $event"
        @new-session="emit('newSession')"
        @rename-session="emit('renameSession', $event)"
        @select-session="emit('selectSession', $event)"
        @delete-session="emit('deleteSession', $event)"
        @delete-sessions="emit('deleteSessions', $event)"
      />
    </BottomDrawer>
    <PopoverRoot v-else-if="desktopMode === 'popover' && !editingSessionId" :open="open" @update:open="emit('update:open', $event)">
      <PopoverTrigger v-if="$slots.trigger" as-child>
        <slot name="trigger" />
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          :side-offset="8"
          align="start"
          :class="[
            'z-[9999] rounded-xl border border-neutral-100 text-neutral-900 shadow-lg outline-none dark:border-neutral-800 dark:text-neutral-100',
            'w-[min(20rem,calc(100vw-2rem))] overflow-hidden bg-white/95 p-1.5 backdrop-blur-xl dark:bg-neutral-900/95',
            'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
            'motion-reduce:animate-none',
          ]"
          @open-auto-focus="preserveTriggerFocus"
          @close-auto-focus="restoreTriggerFocus"
        >
          <SessionsList
            v-model:selecting="selecting"
            compact
            :rows="rows"
            :is-creating-session="isCreatingSession"
            @configure-session="editingSessionId = $event"
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
      <DialogTrigger v-if="$slots.trigger" as-child>
        <slot name="trigger" />
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay
          :class="['fixed inset-0 z-[9999]', editingSessionId ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/35', 'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn', 'motion-reduce:animate-none']"
        />
        <DialogContent
          aria-modal="true"
          :aria-describedby="undefined"
          :class="[
            'pointer-events-auto fixed left-1/2 top-1/2 z-[9999] flex flex-col',
            '-translate-x-1/2 -translate-y-1/2 text-neutral-900 shadow-xl outline-none dark:bg-neutral-900 dark:text-neutral-100',
            'data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow',
            'motion-reduce:animate-none',
            editingSessionId
              ? 'max-h-[calc(100dvh-2rem)] max-w-lg w-[calc(100dvw-2rem)] overflow-y-auto overscroll-contain rounded-2xl bg-white p-6'
              : 'max-h-[80dvh] max-w-md w-[92dvw] rounded-3xl bg-neutral-50 p-5',
          ]"
          @close-auto-focus="restoreTriggerFocus"
        >
          <div v-if="!editingSessionId" :class="['mb-5 flex shrink-0 items-center justify-between gap-3']">
            <DialogTitle :class="['text-xl font-semibold tracking-tight']">
              {{ t('stage.chat.sessions.title') }}
            </DialogTitle>
          </div>
          <SessionFeatureSettings
            v-if="editingSessionId" :class="['shrink-0']"
            :session-id="editingSessionId"
          >
            <template #title>
              <DialogTitle :class="['text-lg font-semibold tracking-tight']">
                {{ t('settings.session-features.session-title') }}
              </DialogTitle>
            </template>
            <template #close>
              <DialogClose as-child>
                <GhostButton size="unset" :class="['size-8 shrink-0 rounded-lg']" :aria-label="t('settings.session-features.close')">
                  <span aria-hidden="true" :class="['i-solar:close-circle-outline size-5']" />
                </GhostButton>
              </DialogClose>
            </template>
          </SessionFeatureSettings>
          <SessionsList
            v-else
            v-model:selecting="selecting"
            :rows="rows"
            :is-creating-session="isCreatingSession"
            @configure-session="editingSessionId = $event"
            @new-session="emit('newSession')"
            @rename-session="emit('renameSession', $event)"
            @select-session="emit('selectSession', $event)"
            @delete-session="emit('deleteSession', $event)"
            @delete-sessions="emit('deleteSessions', $event)"
          />
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
