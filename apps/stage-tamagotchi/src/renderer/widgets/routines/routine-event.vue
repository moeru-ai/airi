<script setup lang="ts">
import type { RoutineWidgetEvent } from '../../../shared/routine-widgets'

import { localDate } from '@proj-airi/stage-ui/libs/routines/schedule'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useRoutinePresentation } from '../../composables/use-routine-presentation'

const props = defineProps<{ event: RoutineWidgetEvent, timeZone: string, now: number, date: string }>()
const { t } = useI18n()
const presentation = useRoutinePresentation(() => props.timeZone)
const label = computed(() => presentation.label(props.event))
const current = computed(() => props.event.startAt <= props.now && props.event.endAt > props.now)
const status = computed(() => props.event.status === 'completed' ? 'completed' : current.value ? 'ongoing' : 'planned')
const overnight = computed(() => localDate(props.event.startAt, props.timeZone) !== localDate(props.event.endAt, props.timeZone))
</script>

<template>
  <article
    :data-activity-id="event.activityId"
    :data-source-label="event.sourceLabel"
    :data-occurrence-date="event.date"
    :aria-current="current ? 'time' : undefined"
    :class="['relative rounded-xl p-3', current ? 'bg-primary-500/12 ring-1 ring-primary-400/40' : 'bg-neutral-500/6', event.status === 'completed' ? 'opacity-65' : '']"
  >
    <div :class="['flex items-start gap-3']">
      <span :class="['mt-1.5 size-2.5 shrink-0 rounded-full']" :style="{ backgroundColor: event.color }" />
      <div :class="['min-w-0 flex-1']">
        <p :title="label.sourceLabel" :class="['m-0 break-words text-base font-medium leading-snug [overflow-wrap:anywhere]']">
          {{ label.displayLabel }}
        </p>
        <p :class="['my-1 text-sm tabular-nums opacity-80']">
          {{ presentation.time(event.startAt) }} – {{ presentation.time(event.endAt) }}
          <span v-if="overnight"> · {{ t('routines.widgets.overnight') }}</span>
        </p>
        <p :class="['m-0 flex flex-wrap gap-x-2 gap-y-1 text-xs opacity-75']">
          <span>{{ t(`routines.widgets.${status}`) }}</span>
          <span>· {{ t(`routines.widgets.${event.category}`) }}</span>
          <span v-if="event.modified">· {{ t('routines.widgets.modified') }}</span>
          <span v-if="event.date !== date">· {{ presentation.date(event.date) }}</span>
        </p>
      </div>
      <span v-if="event.status === 'completed'" :class="['i-solar:check-circle-linear size-5 shrink-0']" aria-hidden="true" />
    </div>
  </article>
</template>
