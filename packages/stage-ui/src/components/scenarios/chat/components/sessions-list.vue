<script lang="ts">
import type { ChatSessionMeta } from '../../../../types/chat-session'

import { BasicButton, Button, GhostButton, ScrollableArea, SwipeActionButton, SwipeActionsContent, SwipeActionsItem, SwipeActionsList, SwipeActionsRoot } from '@proj-airi/ui'
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
// The expanded row belongs to this open list, never to persisted session state.
const expandedSessionId = shallowRef<string>()
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
      <TransitionGroup v-else name="session-row" tag="ul" :class="['m-0 list-none space-y-2 p-0']">
        <li
          v-for="row in rows"
          :key="row.meta.sessionId"
          :class="['overflow-hidden rounded-2xl']"
        >
          <SwipeActionsRoot
            v-slot="{ open, toggle }"
            :open="expandedSessionId === row.meta.sessionId"
            @update:open="expandedSessionId = $event ? row.meta.sessionId : undefined"
            @interaction-start="expandedSessionId !== row.meta.sessionId && (expandedSessionId = undefined)"
            @action="emit('deleteSession', row.meta.sessionId)"
          >
            <SwipeActionsList :gap="16">
              <SwipeActionsItem v-slot="{ takeover }" value="delete" as-child>
                <SwipeActionButton
                  :label="t('stage.chat.sessions.delete-short')"
                  :aria-label="t('stage.chat.sessions.delete')"
                  icon="i-solar:trash-bin-trash-outline"
                  surface-class="bg-red-500 text-white"
                  :takeover="takeover"
                  :class="['text-red-500 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-red-500']"
                />
              </SwipeActionsItem>
            </SwipeActionsList>
            <SwipeActionsContent>
              <div :class="['flex items-center overflow-hidden rounded-2xl pr-1', row.isActive ? 'bg-primary-50 dark:bg-primary-950' : 'bg-white dark:bg-neutral-800']">
                <BasicButton
                  size="unset"
                  :aria-current="row.isActive ? 'true' : undefined"
                  :class="[
                    'session-select active:scale-100! min-h-20 min-w-0 flex-1 rounded-2xl px-3 py-3 text-left',
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
                  :aria-expanded="open"
                  :tabindex="open ? -1 : 0"
                  :style="{ opacity: 'calc(1 - var(--swipe-progress, 0))' }"
                  @click="toggle()"
                >
                  <span aria-hidden="true" :class="['i-solar:trash-bin-trash-outline size-5']" />
                </GhostButton>
              </div>
            </SwipeActionsContent>
          </SwipeActionsRoot>
        </li>
      </TransitionGroup>
    </ScrollableArea>
  </div>
</template>

<style scoped>
.session-select :deep(.basic-button-content) {
  width: 100%;
  min-width: 0;
  gap: 0.75rem;
}

.session-row-leave-active {
  transition: max-height 220ms ease, opacity 180ms ease, margin 220ms ease;
  max-height: 80px;
  pointer-events: none;
}
.session-row-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
}
@media (prefers-reduced-motion: reduce) {
  .session-row-leave-active {
    transition: none;
  }
}
</style>
