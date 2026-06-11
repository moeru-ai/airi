<script setup lang="ts">
import type { DailySummaryProgressNarrative, LocalizedText, Task, TaskProgressNarrative } from '@proj-airi/server-sdk-shared'

import { useScreenObservationStore } from '@proj-airi/stage-ui/stores/modules/screen-observation'
import { progressPhraseFrom } from '@proj-airi/stage-ui/utils/progress-language'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import WindowTitleBar from '../../components/Window/TitleBar.vue'

const { t, locale } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`tamagotchi.dashboard.${key}`, params ?? {})

const store = useScreenObservationStore()
const { activeTasks, tasks, latestDailySummary, statusLabelKey, isEffectivelyObserving } = storeToRefs(store)

const STATUS_DOT: Record<Task['status'], string> = {
  draft: 'bg-neutral-400',
  active: 'bg-emerald-500',
  paused: 'bg-amber-500',
  completed: 'bg-primary-400',
  cancelled: 'bg-neutral-300',
  archived: 'bg-neutral-300',
}

function localizedText(text: LocalizedText) {
  if (typeof text === 'string')
    return text

  return t(text.key, text.params ?? {})
}

// Humanized phrase only — the spec forbids bare percentages anywhere.
function narrativeText(narrative: TaskProgressNarrative | undefined, timeZone?: string) {
  if (!narrative)
    return tn('task.no-progress-yet')

  const phrase = progressPhraseFrom(narrative, {
    locale: locale.value,
    now: new Date(),
    timeZone,
  })
  if (!phrase.remaining)
    return tn('task.no-progress-yet')
  if (phrase.eta) {
    return phrase.isOffTrack
      ? tn('task.progress-off-track', { remaining: phrase.remaining, eta: phrase.eta })
      : tn('task.progress-on-track', { remaining: phrase.remaining, eta: phrase.eta })
  }
  return phrase.remaining
}

function progressText(task: Task) {
  return narrativeText(task.progressNarrative, task.schedule.timezone)
}

function dailySummaryNarrativeText(narrative: DailySummaryProgressNarrative | undefined, timeZone?: string) {
  if (!narrative)
    return tn('task.no-progress-yet')

  return narrativeText({
    remainingWork: localizedText(narrative.remainingWork),
    etaAt: narrative.etaAt,
    pace: narrative.pace ? localizedText(narrative.pace) : undefined,
    isOffTrack: narrative.isOffTrack,
  }, timeZone)
}

function timeLeftText(task: Task) {
  if (!task.schedule.dueAt)
    return ''

  const due = new Date(task.schedule.dueAt)
  const diffMinutes = Math.round((due.getTime() - Date.now()) / 60_000)
  const relative = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  if (Math.abs(diffMinutes) < 60)
    return relative.format(diffMinutes, 'minute')
  if (Math.abs(diffMinutes) < 60 * 24)
    return relative.format(Math.round(diffMinutes / 60), 'hour')
  return relative.format(Math.round(diffMinutes / (60 * 24)), 'day')
}

const completedToday = computed(() => {
  const summaryTasks = latestDailySummary.value?.tasks ?? []
  return summaryTasks.filter(task => task.status === 'completed').length
})

// taskSummaries rows carry only taskId; status (for the dot) and timezone
// (for ETA rendering) come from the matching task in the same payload.
const summaryTaskById = computed(() => {
  const byId = new Map<string, Task>()
  for (const task of latestDailySummary.value?.tasks ?? [])
    byId.set(task.id, task)
  return byId
})
</script>

<template>
  <div h-full w-full pt="44px" overflow-y-scroll>
    <WindowTitleBar
      :title="tn('title')"
      icon="i-solar:checklist-minimalistic-bold"
    />

    <div class="mx-auto max-w-3xl flex flex-col gap-6 p-6">
      <div
        :class="[
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
          isEffectivelyObserving
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-300',
        ]"
      >
        <div :class="isEffectivelyObserving ? 'i-solar:eye-bold-duotone' : 'i-solar:eye-closed-bold-duotone'" class="size-4 shrink-0" />
        {{ t(statusLabelKey) }}
      </div>

      <section flex="~ col gap-3">
        <h2 class="m-0 text-base font-semibold">
          {{ tn('tasks.title') }}
        </h2>

        <div
          v-if="!activeTasks.length"
          :class="[
            'rounded-lg p-8 text-center text-sm',
            'border-2 border-dashed border-neutral-200 text-neutral-500',
            'dark:border-neutral-800',
          ]"
        >
          {{ tn('tasks.empty') }}
        </div>

        <ul v-else class="m-0 flex flex-col gap-2 p-0">
          <li
            v-for="task in activeTasks"
            :key="task.id"
            :class="[
              'flex items-center gap-3 rounded-xl px-4 py-3',
              'list-none border-2 border-solid border-neutral-100 bg-white',
              'transition-colors duration-200 hover:border-primary-500/30',
              'dark:border-neutral-900 dark:bg-neutral-900/40 dark:hover:border-primary-400/30',
            ]"
          >
            <span :class="['size-2.5 shrink-0 rounded-full', STATUS_DOT[task.status]]" />
            <div class="min-w-0 flex flex-1 flex-col gap-0.5">
              <span class="truncate text-sm font-medium">{{ task.title }}</span>
              <span class="truncate text-xs text-neutral-500 dark:text-neutral-400">{{ progressText(task) }}</span>
            </div>
            <span v-if="timeLeftText(task)" class="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">
              {{ timeLeftText(task) }}
            </span>
          </li>
        </ul>
      </section>

      <section flex="~ col gap-3">
        <h2 class="m-0 text-base font-semibold">
          {{ tn('daily-summary.title') }}
        </h2>

        <div
          v-if="!latestDailySummary"
          :class="[
            'rounded-lg p-8 text-center text-sm',
            'border-2 border-dashed border-neutral-200 text-neutral-500',
            'dark:border-neutral-800',
          ]"
        >
          {{ tn('daily-summary.empty') }}
        </div>

        <div
          v-else
          :class="[
            'flex flex-col gap-3 rounded-xl p-4',
            'border-2 border-solid border-primary-100 bg-primary-50/40',
            'dark:border-primary-900/60 dark:bg-primary-900/10',
          ]"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium">
              {{ tn('daily-summary.headline', { total: latestDailySummary.tasks.length, completed: completedToday }) }}
            </span>
            <span class="text-xs text-neutral-500 dark:text-neutral-400">
              {{ latestDailySummary.localDate }}
            </span>
          </div>

          <ul class="m-0 flex flex-col gap-3 p-0">
            <li
              v-for="line in latestDailySummary.taskSummaries"
              :key="line.taskId"
              class="flex flex-col list-none gap-1"
            >
              <div class="flex items-center gap-2 text-sm">
                <span :class="['size-2 shrink-0 rounded-full', STATUS_DOT[summaryTaskById.get(line.taskId)?.status ?? 'draft']]" />
                <span class="truncate font-medium">{{ line.title }}</span>
                <span class="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {{ dailySummaryNarrativeText(line.progress, summaryTaskById.get(line.taskId)?.schedule.timezone) }}
                </span>
              </div>
              <div class="flex items-start gap-1.5 pl-4 text-xs text-neutral-600 dark:text-neutral-300">
                <div class="i-solar:eye-bold-duotone mt-0.5 size-3 shrink-0 opacity-60" />
                <span>{{ tn('daily-summary.observation', { text: localizedText(line.observation) }) }}</span>
              </div>
              <div class="flex items-start gap-1.5 pl-4 text-xs text-neutral-600 dark:text-neutral-300">
                <div class="i-solar:sun-2-bold-duotone mt-0.5 size-3 shrink-0 opacity-60" />
                <span>{{ tn('daily-summary.tomorrow', { text: localizedText(line.tomorrowSuggestion) }) }}</span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <p v-if="tasks.length === 0" class="m-0 text-center text-xs text-neutral-400 dark:text-neutral-500">
        {{ tn('hint.create-from-chat') }}
      </p>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: stage
</route>
