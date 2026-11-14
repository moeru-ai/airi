<script setup lang="ts">
import type { RoutineClient, RoutineCommand, RoutineView } from '@proj-airi/stage-ui/libs/routines/contracts'
import type { Routine } from '@proj-airi/stage-ui/libs/routines/model'
import type { Occurrence } from '@proj-airi/stage-ui/libs/routines/schedule'

import { errorMessageFrom } from '@moeru/std'
import { describeActivityLabel } from '@proj-airi/stage-ui/libs/routines/labels'
import { importMaru, minutesToTime, timeToMinutes } from '@proj-airi/stage-ui/libs/routines/maru'
import { routineSchema, shortSleepDays, sleepMinutesByDay } from '@proj-airi/stage-ui/libs/routines/model'
import { Button, Checkbox, Input } from '@proj-airi/ui'
import { nanoid } from 'nanoid'
import { computed, onMounted, onUnmounted, ref, toRaw } from 'vue'
import { useI18n } from 'vue-i18n'

import * as v from 'valibot'

import { useRoutinePresentation } from '../../composables/use-routine-presentation'

const props = defineProps<{ client: RoutineClient }>()
const { t, locale } = useI18n()
const tt = (key: string) => t(`routines.${key}`)
const view = ref<RoutineView>()
const source = ref('')
const zone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone)
const draft = ref<Routine>()
const presentation = useRoutinePresentation(() => view.value?.state.routine?.timeZone ?? zone.value)
const error = ref('')
const busy = ref(false)
const draftRevision = ref(0)
const settingsRevision = ref(0)
const reviewed = ref(false)
const sleepAcknowledged = ref(false)
const enabled = ref(false)
const remindersEnabled = ref(false)
const advanceMinutes = ref(15)
let refreshTimer: ReturnType<typeof setInterval> | undefined

const warning = computed(() => {
  const routine = draft.value ?? view.value?.state.routine
  return routine ? shortSleepDays(routine.activities).length > 0 : false
})
const sleepMinutes = computed(() => {
  const routine = draft.value ?? view.value?.state.routine
  if (!routine)
    return 0
  const days = new Set(routine.activities.flatMap(activity => activity.days))
  const totals = sleepMinutesByDay(routine.activities)
  return Math.min(...[...days].map(day => totals[day]))
})
const weekdays = computed(() => Array.from({ length: 7 }, (_, day) => ({
  day,
  label: new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2026, 0, 4 + day)),
})))
const validReview = computed(() => reviewed.value && (!warning.value || sleepAcknowledged.value))

async function refresh(resetSettings = false) {
  view.value = await props.client.read()
  if (resetSettings) {
    settingsRevision.value = view.value.state.revision
    const routine = view.value.state.routine
    reviewed.value = routine?.reviewed ?? false
    sleepAcknowledged.value = routine?.shortSleepAcknowledged ?? false
    enabled.value = routine?.enabled ?? false
    remindersEnabled.value = routine?.remindersEnabled ?? false
    advanceMinutes.value = routine?.advanceMinutes ?? 15
  }
}
async function run(operation: () => void | Promise<void>) {
  if (busy.value)
    return
  busy.value = true
  error.value = ''
  try {
    await operation()
  }
  catch (cause) {
    error.value = localizedError(cause)
  }
  finally {
    busy.value = false
  }
}
function preview() {
  void run(() => {
    draftRevision.value = view.value?.state.revision ?? 0
    draft.value = importMaru(source.value, zone.value)
  })
}
function create() {
  draftRevision.value = view.value?.state.revision ?? 0
  draft.value = {
    id: nanoid(),
    title: '',
    subtitle: '',
    timeZone: zone.value,
    activities: [{ id: nanoid(), label: tt('newActivity'), category: 'other', start: 540, end: 600, color: '#5FA8E8', days: [0, 1, 2, 3, 4, 5, 6] }],
    reviewed: false,
    shortSleepAcknowledged: false,
    enabled: false,
    remindersEnabled: false,
    advanceMinutes: 15,
    pausedUntil: 0,
  }
}
function edit() {
  if (view.value?.state.routine) {
    draftRevision.value = view.value.state.revision
    draft.value = structuredClone(toRaw(view.value.state.routine))
  }
}
async function save() {
  await run(async () => {
    if (!draft.value || !view.value)
      return
    const routine = v.parse(routineSchema, { ...draft.value, reviewed: false, shortSleepAcknowledged: false, enabled: false, remindersEnabled: false })
    await props.client.apply({ kind: 'save', expectedRevision: draftRevision.value, routine, replace: !!view.value.state.routine && view.value.state.routine.id !== routine.id })
    draft.value = undefined
    await refresh(true)
  })
}
async function configure() {
  await run(async () => {
    if (!view.value)
      return
    await props.client.apply({
      kind: 'configure',
      expectedRevision: settingsRevision.value,
      reviewed: reviewed.value,
      shortSleepAcknowledged: sleepAcknowledged.value,
      enabled: enabled.value,
      remindersEnabled: enabled.value && remindersEnabled.value,
      advanceMinutes: advanceMinutes.value,
    })
    await refresh(true)
  })
}
function command(value: RoutineCommand) {
  void run(async () => {
    await props.client.apply(value)
    await refresh(true)
  })
}
function toggleDay(index: number, day: number) {
  const activity = draft.value?.activities[index]
  if (activity)
    activity.days = activity.days.includes(day) ? activity.days.filter(item => item !== day) : [...activity.days, day].sort()
}
function setTime(index: number, field: 'start' | 'end', value: string | undefined) {
  void run(() => {
    if (draft.value && value)
      draft.value.activities[index][field] = timeToMinutes(value)
  })
}
function addActivity() {
  draft.value?.activities.push({ id: nanoid(), label: tt('newActivity'), category: 'other', start: 600, end: 660, color: '#7FCFA0', days: [0, 1, 2, 3, 4, 5, 6] })
}
function localizedError(cause: unknown) {
  const message = errorMessageFrom(cause) ?? ''
  const codes = new Map([
    ['user-cancelled', 'errors.cancelled'],
    ['expired-proposal', 'errors.expired'],
    ['stale-revision', 'stale'],
    ['overlap', 'errors.conflict'],
    ['postpone-must-be-later', 'errors.later'],
    ['future-completion-refused', 'errors.future'],
    ['routine-required', 'errors.required'],
    ['invalid-', 'errors.invalid'],
  ])
  return tt([...codes].find(([code]) => message.includes(code))?.[1] ?? 'failed')
}
function occurrenceLabel(item: Occurrence | null | undefined) {
  if (!item)
    return tt('none')
  const activity = view.value?.state.routine?.activities.find(activity => activity.id === item.activityId)
  return activity ? presentation.activityLabel(activity).displayLabel : item.label
}
function setDisplayLabel(index: number, value: string | undefined) {
  const activity = draft.value?.activities[index]
  if (!activity)
    return
  const labels: Record<string, string> = { ...activity.displayLabels }
  if (value?.trim())
    labels[locale.value] = value
  else
    delete labels[locale.value]
  if (Object.keys(labels).length)
    activity.displayLabels = labels
  else
    delete activity.displayLabels
}
function describeProposal(proposal: RoutineView['proposals'][number]) {
  const change = proposal.change
  if (change.kind === 'mute-today')
    return tt(change.kind)
  const activity = view.value?.state.routine?.activities.find(activity => activity.id === change.activityId)
  const label = activity ? presentation.activityLabel(activity).displayLabel : tt('activity')
  const timing = change.kind === 'postpone' ? ` · ${tt('start')}: ${minutesToTime(change.start)}` : ''
  return `${tt(change.kind)}: ${label} · ${presentation.date(change.date)}${timing} · ${view.value?.state.routine?.timeZone ?? ''}`
}
function confirm(id: string) {
  void run(async () => {
    await props.client.confirm(id)
    await refresh(true)
  })
}
onMounted(() => {
  void run(() => refresh(true))
  refreshTimer = setInterval(() => {
    if (!busy.value)
      void refresh().catch((cause) => { error.value = localizedError(cause) })
  }, 10000)
})
onUnmounted(() => clearInterval(refreshTimer))
</script>

<template>
  <div :lang="locale" :class="['flex flex-col gap-5', 'pb-10']">
    <p>{{ tt('description') }}</p>
    <p>{{ tt('processOnly') }}</p>
    <p>{{ tt('conversation') }}</p>
    <p v-if="view?.storageError" role="alert">
      {{ tt('storageError') }}
    </p>
    <div v-if="view && settingsRevision !== view.state.revision">
      <p>{{ tt('stale') }}</p>
      <Button :disabled="busy" @click="run(() => refresh(true))">
        {{ tt('reload') }}
      </Button>
    </div>
    <p v-if="error" role="alert" :class="['text-red-600 dark:text-red-300', 'break-words']">
      {{ error }}
    </p>
    <section :class="['flex flex-col gap-3', 'rounded-xl bg-neutral-100 p-4 dark:bg-neutral-900']" :aria-label="tt('import')">
      <label>{{ tt('url') }}<Input v-model="source" data-testid="maru-url" :disabled="busy" /></label>
      <label>{{ tt('timeZone') }}<Input v-model="zone" :disabled="busy" /></label>
      <div :class="['flex flex-wrap gap-3']">
        <Button :disabled="busy || !view" @click="preview">
          {{ tt('preview') }}
        </Button>
        <Button :disabled="busy || !view" @click="create">
          {{ tt('create') }}
        </Button>
      </div>
    </section>
    <section v-if="warning" role="note" :class="['rounded-xl border-2 border-amber-500 p-4']">
      <strong>{{ tt('shortSleep') }}</strong>
      <p data-testid="sleep-duration">
        {{ t('routines.sleepDuration', { hours: presentation.number(Math.floor(sleepMinutes / 60)), minutes: presentation.number(sleepMinutes % 60) }) }}
      </p>
      <p>{{ tt('sleepReview') }}</p>
    </section>
    <section v-if="draft" :class="['flex flex-col gap-4']" :aria-label="tt('preview')">
      <p>{{ tt('inactiveImport') }}</p>
      <label>{{ tt('title') }}<Input v-model="draft.title" /></label>
      <label>{{ tt('subtitle') }}<Input v-model="draft.subtitle" /></label>
      <label>{{ tt('timeZone') }}<Input v-model="draft.timeZone" /></label>
      <article v-for="(activity, index) in draft.activities" :key="activity.id" :class="['flex flex-col gap-3', 'rounded-xl border-2 border-neutral-200 p-4 dark:border-neutral-700']">
        <label>{{ tt('sourceLabel') }}<Input v-model="activity.label" data-testid="activity-label" :aria-label="tt('sourceLabel')" /></label>
        <p :class="['m-0 text-xs opacity-70']">
          {{ tt('sourceLabelHelp') }}
        </p>
        <label>{{ tt('displayLabel') }} ({{ locale }})<Input :model-value="activity.displayLabels?.[locale as keyof NonNullable<typeof activity.displayLabels>] ?? ''" :placeholder="describeActivityLabel(activity, locale, t).displayLabel" data-testid="activity-display-label" :aria-label="tt('displayLabel')" @update:model-value="setDisplayLabel(index, $event)" /></label>
        <p :class="['m-0 text-xs opacity-70']">
          {{ tt('displayLabelHelp') }}
        </p>
        <p v-if="!describeActivityLabel(activity, locale, t).semanticLabel" :class="['m-0 text-xs opacity-70']">
          {{ tt('unknownLabel') }}
        </p>
        <div :class="['grid grid-cols-1 gap-3 sm:grid-cols-2']">
          <label>{{ tt('start') }}<Input :model-value="minutesToTime(activity.start)" type="time" data-testid="activity-start" @update:model-value="setTime(index, 'start', $event)" /></label>
          <label>{{ tt('end') }}<Input :model-value="minutesToTime(activity.end)" type="time" @update:model-value="setTime(index, 'end', $event)" /></label>
          <label>{{ tt('color') }}<Input v-model="activity.color" type="color" /></label>
          <label :class="['flex items-center gap-3']">{{ tt('sleep') }}<Checkbox :model-value="activity.category === 'sleep'" @update:model-value="activity.category = $event ? 'sleep' : 'other'" /></label>
        </div>
        <p v-if="activity.end < activity.start">
          {{ tt('overnight') }}
        </p>
        <div :class="['flex flex-wrap gap-2']" :aria-label="tt('weekdays')">
          <Button v-for="day in weekdays" :key="day.day" size="sm" :aria-pressed="activity.days.includes(day.day)" @click="toggleDay(index, day.day)">
            {{ day.label }} {{ activity.days.includes(day.day) ? '✓' : '' }}
          </Button>
        </div>
        <Button @click="draft.activities.splice(index, 1)">
          {{ tt('removeActivity') }}
        </Button>
      </article>
      <div :class="['flex flex-wrap gap-3']">
        <Button :disabled="draft.activities.length >= 60" @click="addActivity">
          {{ tt('addActivity') }}
        </Button>
        <Button :disabled="busy" variant="primary" color="primary" @click="save">
          {{ tt('save') }}
        </Button>
        <Button :disabled="busy" @click="draft = undefined">
          {{ tt('cancel') }}
        </Button>
      </div>
    </section>
    <section v-else-if="view?.state.routine" :class="['flex flex-col gap-4']">
      <h2 :class="['text-lg font-bold']">
        {{ view.state.routine.title || tt('title') }}
      </h2>
      <p>{{ view.state.routine.timeZone }} · {{ tt(view.state.routine.enabled ? 'active' : 'inactive') }}</p>
      <p v-if="view.state.routine.pausedUntil > Date.now()">
        {{ tt('paused') }} {{ presentation.datetime(view.state.routine.pausedUntil) }}
      </p>
      <p v-if="view.state.mutedDate === view.schedule.date">
        {{ tt('muted') }}
      </p>
      <p>{{ tt('current') }}: {{ occurrenceLabel(view.schedule.current) }}</p>
      <p>{{ tt('next') }}: {{ occurrenceLabel(view.schedule.next) }} {{ view.schedule.next ? presentation.datetime(view.schedule.next.startAt) : '' }}</p>
      <h3>{{ tt('today') }}</h3>
      <ul :class="['flex flex-col gap-2']">
        <li v-for="item in view.schedule.today" :key="`${item.activityId}:${item.date}`" :class="['border-l-4 pl-3']" :style="{ borderColor: item.color }">
          {{ occurrenceLabel(item) }} · {{ presentation.datetime(item.startAt) }} – {{ presentation.datetime(item.endAt) }} · {{ tt(item.status) }}
        </li>
      </ul>
      <label :class="['flex items-center gap-3']"><Checkbox v-model="reviewed" />{{ tt('review') }}</label>
      <label v-if="warning" :class="['flex items-center gap-3']"><Checkbox v-model="sleepAcknowledged" />{{ tt('acknowledgeSleep') }}</label>
      <label :class="['flex items-center gap-3']"><Checkbox v-model="enabled" :disabled="!validReview" />{{ tt('enable') }}</label>
      <label :class="['flex items-center gap-3']"><Checkbox v-model="remindersEnabled" :disabled="!validReview || !enabled" />{{ tt('enableReminders') }}</label>
      <label>{{ tt('advance') }}<Input v-model="advanceMinutes" type="number" min="0" max="120" /></label>
      <div :class="['flex flex-wrap gap-3']">
        <Button :disabled="busy" @click="configure">
          {{ tt('applySettings') }}
        </Button>
        <Button :disabled="busy" @click="edit">
          {{ tt('edit') }}
        </Button>
        <Button :disabled="busy" @click="command({ kind: 'pause', expectedRevision: view.state.revision, until: Date.now() + 3600000 })">
          {{ tt('pauseHour') }}
        </Button>
        <Button :disabled="busy" @click="command({ kind: 'pause', expectedRevision: view.state.revision, until: 0 })">
          {{ tt('resume') }}
        </Button>
        <Button :disabled="busy" @click="command({ kind: 'delete', expectedRevision: view.state.revision })">
          {{ tt('delete') }}
        </Button>
      </div>
    </section>
    <section v-if="view?.proposals.length" :class="['flex flex-col gap-3']">
      <h2>{{ tt('pending') }}</h2>
      <article v-for="proposal in view.proposals" :key="proposal.id" :class="['rounded-xl border-2 border-neutral-300 p-4 dark:border-neutral-700']">
        <pre :class="['whitespace-pre-wrap break-words']">{{ describeProposal(proposal) }}</pre>
        <p>{{ tt('expires') }} {{ presentation.datetime(proposal.expiresAt) }}</p>
        <Button :disabled="busy || proposal.revision !== view.state.revision" @click="confirm(proposal.id)">
          {{ tt('confirm') }}
        </Button>
      </article>
    </section>
  </div>
</template>
