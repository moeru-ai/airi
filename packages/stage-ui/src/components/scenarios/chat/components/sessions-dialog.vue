<script setup lang="ts">
import type { ChatSessionMeta } from '../../../../types/chat-session'

import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { useI18n } from 'vue-i18n'

interface SessionRow {
  meta: ChatSessionMeta
  preview: string
  isActive: boolean
  updatedAtLabel: string
}

interface Props {
  open: boolean
  rows: SessionRow[]
  isDesktop: boolean
  isCreatingSession: boolean
  mobilePaddingBottom: string
}

defineProps<Props>()

const emit = defineEmits<{
  'deleteSession': [sessionId: string]
  'newSession': []
  'selectSession': [sessionId: string]
  'update:open': [open: boolean]
}>()

const { t } = useI18n()
</script>

<template>
  <DialogRoot :open="open" @update:open="value => emit('update:open', value)">
    <slot name="trigger" />
    <DialogPortal>
      <DialogOverlay
        :class="[
          'fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm',
          'data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn',
        ]"
      />
      <DialogContent
        :aria-describedby="undefined"
        :class="[
          'fixed z-[9999] flex flex-col overflow-hidden bg-white/95 shadow-xl outline-none backdrop-blur-md dark:bg-neutral-900/95',
          isDesktop
            ? 'left-1/2 top-1/2 max-h-[80dvh] max-w-md w-[92dvw] rounded-2xl -translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-contentHide data-[state=open]:animate-contentShow'
            : 'bottom-0 left-0 right-0 max-h-[85dvh] rounded-t-[32px]',
        ]"
        :style="isDesktop ? undefined : { paddingBottom: mobilePaddingBottom }"
      >
        <div
          v-if="!isDesktop"
          :class="['mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-neutral-400 dark:bg-neutral-600']"
          aria-hidden="true"
        />
        <div :class="['flex min-h-0 flex-1 flex-col']">
          <div :class="['flex items-center justify-between px-5 pt-5 pb-3']">
            <DialogTitle :class="['text-base font-medium text-neutral-700 dark:text-neutral-200']">
              {{ t('stage.chat.sessions.title') }}
            </DialogTitle>
            <button
              type="button"
              :class="[
                'rounded-lg px-3 py-1.5 text-xs font-medium',
                'bg-primary-100/60 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
                'hover:bg-primary-200/70 dark:hover:bg-primary-800/50',
                'transition-colors',
              ]"
              :disabled="isCreatingSession"
              data-chat-session-action="new"
              @click="emit('newSession')"
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
                'group relative mb-1 w-full rounded-xl transition-colors',
                row.isActive
                  ? 'bg-primary-100/70 dark:bg-primary-900/40'
                  : 'hover:bg-neutral-100/80 dark:hover:bg-neutral-800/60',
              ]"
            >
              <button
                type="button"
                :class="['w-full flex flex-col gap-1 px-3 py-3 text-left outline-none']"
                data-chat-session-action="select"
                :data-session-id="row.meta.sessionId"
                @click="emit('selectSession', row.meta.sessionId)"
              >
                <div :class="['flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200']">
                  <span :class="['flex-1 truncate']">{{ row.preview }}</span>
                  <span
                    v-if="row.meta.cloudChatId"
                    :class="['shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide', 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300']"
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
                type="button"
                :class="[
                  'absolute right-2 top-2 z-10 h-7 w-7 flex items-center justify-center rounded-md',
                  'opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100',
                  'text-neutral-400 hover:bg-red-500/10 hover:text-red-500',
                  'transition-opacity duration-150',
                ]"
                :aria-label="`${t('stage.chat.sessions.delete')}: ${row.preview}`"
                :title="t('stage.chat.sessions.delete')"
                data-chat-session-action="delete"
                :data-session-id="row.meta.sessionId"
                @click.stop="emit('deleteSession', row.meta.sessionId)"
              >
                <div class="i-solar:trash-bin-trash-bold-duotone h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
