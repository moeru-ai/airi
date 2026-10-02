<script setup lang="ts">
import type { BackgroundTask } from '../../../../stores/chat'

import { useI18n } from 'vue-i18n'

/** Background tasks beside the conversation. Each one shows its recipe and state, and can be stopped. */
defineProps<{
  tasks: readonly BackgroundTask[]
}>()

const emit = defineEmits<{
  (e: 'stop', runId: string): void
}>()

const { t } = useI18n()
</script>

<template>
  <ul v-if="tasks.length" :class="['flex flex-wrap', 'gap-1.5', 'px-2 py-1']" :aria-label="t('stage.chat.background-tasks.label')">
    <li
      v-for="task in tasks"
      :key="task.runId"
      :class="[
        'inline-flex max-w-full items-center gap-1.5',
        'rounded-full py-1 pl-2.5 pr-1',
        'text-xs',
        'bg-primary-100/80 text-primary-700 dark:bg-primary-900/70 dark:text-primary-100',
      ]"
    >
      <span :class="[task.state === 'working' ? 'i-eos-icons:loading' : 'i-solar:hourglass-linear', 'shrink-0 text-sm']" aria-hidden="true" />
      <span class="shrink-0 op-75">{{ t(task.state === 'working' ? 'stage.chat.background-tasks.working' : 'stage.chat.background-tasks.waiting') }}</span>
      <span class="truncate font-medium">{{ task.recipeName }}</span>
      <button
        type="button"
        :aria-label="t('stage.chat.background-tasks.stop', { name: task.recipeName })"
        :title="t('stage.chat.background-tasks.stop', { name: task.recipeName })"
        :class="[
          'size-5 shrink-0 rounded-full',
          'inline-flex items-center justify-center',
          'transition-colors duration-200',
          'hover:bg-primary-200/80 dark:hover:bg-primary-800/80',
          'outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60',
        ]"
        @click="emit('stop', task.runId)"
      >
        <span class="i-solar:stop-bold text-xs" aria-hidden="true" />
      </button>
    </li>
  </ul>
</template>
