<script lang="ts">
import type { ChatSessionMeta } from '../../../../types/chat-session'

import { BasicButton, Button, GhostButton, ScrollableArea } from '@proj-airi/ui'
import { shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

/** A conversation preview prepared by the session owner for either dialog surface. */
export interface SessionRow {
  meta: ChatSessionMeta
  preview: string
  isActive: boolean
  updatedAtLabel: string
}
</script>

<script setup lang="ts">
defineProps<{
  rows: SessionRow[]
  isCreatingSession: boolean
}>()

const emit = defineEmits<{
  deleteSession: [sessionId: string]
  newSession: []
  selectSession: [sessionId: string]
}>()

const { t } = useI18n()
// The confirmation belongs to this open list, never to persisted session state.
const pendingDeletion = shallowRef<string>()
let deleteTrigger: HTMLElement | undefined

function requestDeletion(sessionId: string, event: MouseEvent) {
  deleteTrigger = event.currentTarget as HTMLElement
  pendingDeletion.value = sessionId
}

function cancelDeletion() {
  pendingDeletion.value = undefined
  deleteTrigger?.focus()
}
</script>

<template>
  <div :class="['min-h-0 flex flex-col gap-4']">
    <Button
      block color="primary" variant="secondary" size="unset"
      :class="['min-h-12 shrink-0 rounded-2xl px-4 py-3']"
      :loading="isCreatingSession"
      @click="emit('newSession')"
    >
      <span aria-hidden="true" :class="['i-solar:pen-new-square-outline size-5']" />
      {{ t('stage.chat.sessions.new') }}
    </Button>
    <ScrollableArea :class="['min-h-0 max-h-[calc(80dvh-12rem)]']" :viewport-class="['p-1']">
      <div v-if="rows.length === 0" :class="['min-h-40 flex flex-col items-center justify-center gap-3 text-sm text-neutral-500 dark:text-neutral-400']">
        <span aria-hidden="true" :class="['i-solar:dialog-2-outline size-8 text-neutral-400']" />
        {{ t('stage.chat.sessions.empty') }}
      </div>
      <ul v-else :class="['m-0 list-none space-y-2 p-0']">
        <li
          v-for="row in rows"
          :key="row.meta.sessionId"
          :class="[
            'overflow-hidden rounded-2xl',
            row.isActive ? 'bg-primary-50 dark:bg-primary-900/25' : 'bg-white dark:bg-neutral-800/60',
          ]"
        >
          <div :class="['flex items-center pr-1']">
            <BasicButton
              size="unset"
              :aria-current="row.isActive ? 'true' : undefined"
              :class="[
                'session-select min-h-20 min-w-0 flex-1 rounded-2xl px-3 py-3 text-left',
                'focus-visible:outline-2 focus-visible:outline-primary-500',
              ]"
              @click="emit('selectSession', row.meta.sessionId)"
            >
              <span
                aria-hidden="true"
                :class="[
                  'size-5 shrink-0',
                  row.isActive ? 'i-solar:check-circle-bold text-primary-500' : 'i-solar:chat-line-outline text-neutral-400',
                ]"
              />
              <span :class="['min-w-0 flex-1']">
                <span :class="['block truncate text-sm font-medium']">{{ row.preview }}</span>
                <span :class="['mt-1 flex items-center gap-2 text-xs font-normal text-neutral-500 dark:text-neutral-400']">
                  <span>{{ row.updatedAtLabel }}</span>
                  <span v-if="row.isActive" :class="['text-primary-600 dark:text-primary-300']">{{ t('stage.chat.sessions.current') }}</span>
                  <span v-if="row.meta.cloudChatId" role="img" :aria-label="t('stage.chat.sessions.cloud-badge')" :title="t('stage.chat.sessions.cloud-badge')" :class="['i-solar:cloud-check-outline size-4 shrink-0']" />
                </span>
              </span>
            </BasicButton>
            <GhostButton
              size="unset"
              :class="['size-11 shrink-0 rounded-xl text-neutral-400 hover:bg-red-500/10 hover:text-red-500']"
              :aria-label="`${t('stage.chat.sessions.delete')}: ${row.preview}`"
              :title="t('stage.chat.sessions.delete')"
              :aria-expanded="pendingDeletion === row.meta.sessionId"
              @click="requestDeletion(row.meta.sessionId, $event)"
            >
              <span aria-hidden="true" :class="['i-solar:trash-bin-trash-outline size-5']" />
            </GhostButton>
          </div>
          <div v-if="pendingDeletion === row.meta.sessionId" :class="['mx-3 border-t border-neutral-200 py-3 dark:border-neutral-700']">
            <p role="status" :class="['mb-3 text-sm text-neutral-600 dark:text-neutral-300']">
              {{ t('stage.chat.sessions.confirm-delete') }}
            </p>
            <div :class="['flex justify-end gap-2']">
              <Button size="unset" :class="['min-h-11 px-4']" @click="cancelDeletion">
                {{ t('stage.chat.sessions.cancel') }}
              </Button>
              <Button size="unset" color="red" variant="secondary" :class="['min-h-11 px-4']" @click="emit('deleteSession', row.meta.sessionId); pendingDeletion = undefined">
                {{ t('stage.chat.sessions.delete') }}
              </Button>
            </div>
          </div>
        </li>
      </ul>
    </ScrollableArea>
  </div>
</template>

<style scoped>
.session-select :deep(.basic-button-content) {
  width: 100%;
  min-width: 0;
  gap: 0.75rem;
}
</style>
