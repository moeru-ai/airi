<script setup lang="ts">
import type { Task, TouchLevel } from '@proj-airi/server-sdk-shared'

import { Button, Input, Select } from '@proj-airi/ui'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { progressPhraseFrom } from '../../../../utils/progress-language'

const props = defineProps<{
  task: Task
  /** Disables the action row while the chat layer is applying a decision. */
  busy?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'update:dueAt', dueAt: string | undefined): void
  (e: 'update:touchLevel', level: TouchLevel): void
}>()

const { t, locale } = useI18n()
const tn = (key: string, params?: Record<string, unknown>) => t(`stage.chat.task-card.${key}`, params ?? {})

const TOUCH_LEVELS: TouchLevel[] = ['L0', 'L1', 'L2', 'L3']

const touchLevelOptions = computed(() => TOUCH_LEVELS.map(level => ({
  label: tn(`touch-level.${level.toLowerCase()}`),
  value: level,
})))

const touchLevel = computed<TouchLevel>({
  get: () => props.task.touchPolicy.level,
  set: level => emit('update:touchLevel', level),
})

// The card edits the due time as the user's local wall clock; the chat
// layer owns converting back into the task's schedule timezone if needed.
const dueAtLocal = computed<string>({
  get: () => {
    if (!props.task.schedule.dueAt)
      return ''
    const due = new Date(props.task.schedule.dueAt)
    if (Number.isNaN(due.getTime()))
      return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}`
  },
  set: (value) => {
    const parsed = value ? new Date(value) : undefined
    emit('update:dueAt', parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined)
  },
})

const timeFormat = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }))

const timeRangeText = computed(() => {
  const { startsAt, dueAt } = props.task.schedule
  const starts = startsAt ? timeFormat.value.format(new Date(startsAt)) : undefined
  const due = dueAt ? timeFormat.value.format(new Date(dueAt)) : undefined
  if (starts && due)
    return tn('time-range.between', { starts, due })
  if (due)
    return tn('time-range.due-only', { due })
  if (starts)
    return tn('time-range.starts-only', { starts })
  return tn('time-range.unscheduled')
})

// The privacy disclosure row: the moment the task is set IS the first
// privacy notice, so the card must spell out what will be watched —
// including the explicit "nothing is observed" dead-state.
const observationText = computed(() => {
  const { observation } = props.task
  if (!observation.enabled || observation.privacyState === 'disabled')
    return tn('observation.disabled')
  if (observation.allowedApps.length === 0)
    return tn('observation.empty-whitelist')
  return tn('observation.apps', { apps: observation.allowedApps.join('、') })
})

const progressPhrase = computed(() => {
  if (!props.task.progressNarrative)
    return undefined
  return progressPhraseFrom(props.task.progressNarrative, {
    locale: locale.value,
    now: new Date(),
    timeZone: props.task.schedule.timezone,
  })
})

const progressText = computed(() => {
  if (!progressPhrase.value)
    return undefined
  const { remaining, eta, isOffTrack } = progressPhrase.value
  if (!remaining)
    return tn('progress.in-progress')
  if (eta)
    return isOffTrack ? tn('progress.off-track-eta', { remaining, eta }) : tn('progress.remaining-eta', { remaining, eta })
  return remaining
})
</script>

<template>
  <div
    :class="[
      'flex flex-col gap-3 rounded-xl p-4',
      'border-2 border-solid border-primary-100 bg-primary-50/60',
      'dark:border-primary-900/60 dark:bg-primary-900/10',
    ]"
  >
    <div class="flex items-center gap-2">
      <div class="i-solar:clipboard-check-bold-duotone size-4 text-primary-500" />
      <span class="text-xs text-primary-700 font-semibold tracking-wide uppercase dark:text-primary-300">
        {{ tn('title') }}
      </span>
    </div>

    <dl class="m-0 flex flex-col gap-2.5">
      <div class="flex items-start gap-3">
        <dt :class="['flex shrink-0 items-center gap-1.5 pt-0.5', 'w-24 text-xs text-neutral-500 dark:text-neutral-400']">
          <div class="i-solar:flag-bold-duotone size-3.5" />
          {{ tn('rows.goal') }}
        </dt>
        <dd class="m-0 flex-1 text-sm font-medium">
          {{ task.goal }}
        </dd>
      </div>

      <div class="flex items-start gap-3">
        <dt :class="['flex shrink-0 items-center gap-1.5 pt-0.5', 'w-24 text-xs text-neutral-500 dark:text-neutral-400']">
          <div class="i-solar:calendar-bold-duotone size-3.5" />
          {{ tn('rows.time-range') }}
        </dt>
        <dd class="m-0 flex flex-1 flex-col gap-1.5 text-sm">
          <span>{{ timeRangeText }}</span>
          <Input
            v-model="dueAtLocal"
            type="datetime-local"
            :aria-label="tn('rows.due-at')"
            class="max-w-56 text-xs"
          />
        </dd>
      </div>

      <div class="flex items-start gap-3">
        <dt :class="['flex shrink-0 items-center gap-1.5 pt-0.5', 'w-24 text-xs text-neutral-500 dark:text-neutral-400']">
          <div class="i-solar:eye-bold-duotone size-3.5" />
          {{ tn('rows.observation') }}
        </dt>
        <dd class="m-0 flex-1 text-sm">
          {{ observationText }}
        </dd>
      </div>

      <div class="flex items-start gap-3">
        <dt :class="['flex shrink-0 items-center gap-1.5 pt-0.5', 'w-24 text-xs text-neutral-500 dark:text-neutral-400']">
          <div class="i-solar:bell-bold-duotone size-3.5" />
          {{ tn('rows.touch-level') }}
        </dt>
        <dd class="m-0 max-w-56 flex-1 text-sm">
          <Select v-model="touchLevel" :options="touchLevelOptions" :disabled="busy" />
        </dd>
      </div>
    </dl>

    <div
      v-if="progressText"
      :class="[
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
        progressPhrase?.isOffTrack
          ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300'
          : 'bg-primary-500/10 text-primary-700 dark:text-primary-300',
      ]"
    >
      <div :class="progressPhrase?.isOffTrack ? 'i-solar:danger-triangle-bold-duotone' : 'i-solar:graph-up-bold-duotone'" class="size-4 shrink-0" />
      {{ progressText }}
    </div>

    <div class="flex items-center gap-2">
      <Button
        variant="primary" size="sm"
        icon="i-solar:check-circle-bold-duotone" :label="tn('actions.confirm')"
        :disabled="busy" :loading="busy"
        @click="emit('confirm')"
      />
      <Button
        variant="secondary" size="sm"
        :label="tn('actions.cancel')"
        :disabled="busy"
        @click="emit('cancel')"
      />
      <span class="ml-auto text-xs text-neutral-400 dark:text-neutral-500">
        {{ tn('hint.keep-typing') }}
      </span>
    </div>
  </div>
</template>
