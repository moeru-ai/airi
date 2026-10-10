<script setup lang="ts">
import type { BackgroundTask } from '../../../../stores/chat'
import type { ChatSessionTaskStatus } from '../../../../types/chat-session'

import { IconButton, ScrollableArea } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { isOpenTask } from '../../../../stores/chat'

/** Background tasks beside the conversation. An armed or running task can be stopped. A finished one shows its result until it is dismissed. */
defineProps<{
  tasks: readonly BackgroundTask[]
}>()

const emit = defineEmits<{
  (e: 'stop', task: BackgroundTask): void
  (e: 'dismiss', task: BackgroundTask): void
}>()

const { t } = useI18n()

const STATUS_ICONS: Record<ChatSessionTaskStatus, string> = {
  armed: 'i-solar:alarm-linear',
  running: 'i-eos-icons:loading',
  done: 'i-solar:check-circle-linear',
  failed: 'i-solar:danger-circle-linear',
  interrupted: 'i-solar:stop-circle-linear',
}
</script>

<template>
  <!-- The tasks stay on one line and scroll sideways, so the input below never moves. The bottom padding keeps room for the scrollbar, so it never covers a task. -->
  <ScrollableArea v-if="tasks.length" orientation="horizontal" :class="['w-full']">
    <ul :class="['flex w-max', 'gap-1.5', 'px-2 pt-1 pb-3']" :aria-label="t('stage.chat.background-tasks.label')">
      <li
        v-for="task in tasks"
        :key="task.sessionId"
        :class="[
          'inline-flex max-w-full shrink-0 items-center gap-1.5',
          'rounded-full py-1 pl-2.5 pr-1',
          'text-xs',
          task.status === 'failed'
            ? 'bg-red-100/80 text-red-700 dark:bg-red-900/50 dark:text-red-100'
            : isOpenTask(task.status)
              ? 'bg-primary-100/80 text-primary-700 dark:bg-primary-900/70 dark:text-primary-100'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
        ]"
      >
        <span :class="[STATUS_ICONS[task.status], 'shrink-0 text-sm']" aria-hidden="true" />
        <span class="shrink-0 op-75">{{ t(`stage.chat.background-tasks.status.${task.status}`) }}</span>
        <span class="truncate font-medium">{{ task.recipeName }}</span>
        <IconButton
          :aria-label="t(isOpenTask(task.status) ? 'stage.chat.background-tasks.stop' : 'stage.chat.background-tasks.dismiss', { name: task.recipeName })"
          :title="t(isOpenTask(task.status) ? 'stage.chat.background-tasks.stop' : 'stage.chat.background-tasks.dismiss', { name: task.recipeName })"
          :class="[
            'size-5 rounded-full',
            'hover:bg-black/8 dark:hover:bg-white/12',
            'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
          ]"
          @click="isOpenTask(task.status) ? emit('stop', task) : emit('dismiss', task)"
        >
          <span :class="[isOpenTask(task.status) ? 'i-solar:stop-bold' : 'i-solar:close-circle-linear', 'text-xs']" aria-hidden="true" />
        </IconButton>
      </li>
    </ul>
  </ScrollableArea>
</template>
