<script setup lang="ts">
import { GhostButton } from '@proj-airi/ui'
import { useNow } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import * as v from 'valibot'

import RoutineEvent from './routine-event.vue'

import { routineWidgetSchema } from '../../../shared/routine-widgets'
import { useRoutinePresentation } from '../../composables/use-routine-presentation'
import { clockArc, clockInterval, clockPoint, clockRotation } from './clock'

defineOptions({ inheritAttrs: false })

const props = defineProps<{ data?: unknown }>()
const { t, locale } = useI18n()
const clock = ref(false)
const now = useNow({ interval: 15000 })
const { now: handsNow, pause: pauseHands, resume: resumeHands } = useNow({ interval: 1000, controls: true, immediate: false })
const value = computed(() => {
  const parsed = v.safeParse(routineWidgetSchema, props.data)
  return parsed.success ? parsed.output : null
})
watch(() => clock.value && value.value?.mode === 'day' && Boolean(value.value.routine), (running) => {
  if (running) {
    handsNow.value = new Date()
    resumeHands()
  }
  else {
    pauseHands()
  }
})
const presentation = useRoutinePresentation(() => value.value?.timeZone ?? 'UTC')
const events = computed(() => value.value?.events ?? [])
const future = computed(() => {
  const data = value.value
  if (!data)
    return []
  const candidates = [...data.events, data.next, data.following].filter(item => item !== null)
  const unique = new Map(candidates.map(item => [`${item.activityId}:${item.date}`, item]))
  return [...unique.values()].filter(item => item.startAt > now.value.getTime() && item.status !== 'completed').sort((a, b) => a.startAt - b.startAt)
})
const next = computed(() => future.value[0])
const remaining = computed(() => next.value ? Math.max(0, Math.ceil((next.value.startAt - now.value.getTime()) / 60000)) : 0)
const current = computed(() => events.value.find(item => item.startAt <= now.value.getTime() && item.endAt > now.value.getTime()))
const pending = computed(() => events.value.filter(item => item.status !== 'completed'))
const completed = computed(() => events.value.filter(item => item.status === 'completed'))
const rotation = computed(() => value.value?.date ? clockRotation(now.value.getTime(), value.value.date, value.value.timeZone) : 0)
const handsRotation = computed(() => value.value?.date ? clockRotation(handsNow.value.getTime(), value.value.date, value.value.timeZone) : 0)
const clockTime = computed(() => presentation.clock(handsNow.value.getTime()))
const updated = computed(() => value.value ? presentation.time(value.value.generatedAt) : '')
</script>

<template>
  <section :lang="locale" :class="['routine-card h-full w-full box-border flex flex-col overflow-hidden rounded-2xl p-4 pt-6', 'bg-neutral-50/90 text-neutral-800 shadow-lg backdrop-blur-xl dark:bg-neutral-900/90 dark:text-neutral-100']" data-testid="routine-widget">
    <header :class="['mb-3 flex items-center justify-between gap-2 pr-8']">
      <div :class="['flex items-center gap-2 text-sm font-medium']">
        <span :class="['i-solar:calendar-linear size-4 text-primary-500']" aria-hidden="true" />
        {{ t(value?.mode === 'next' ? 'routines.widgets.next' : 'routines.widgets.agenda') }}
      </div>
    </header>
    <p v-if="!value" role="alert">
      {{ t('routines.widgets.unavailable') }}
    </p>
    <p v-else-if="!value.routine">
      {{ t('routines.widgets.empty') }}
    </p>
    <template v-else>
      <div :class="['mb-3 flex flex-wrap items-center gap-2 text-xs']">
        <span v-if="!value.routine.enabled" :class="['rounded-full bg-neutral-500/12 px-2 py-1']">{{ t('routines.widgets.inactive') }}</span>
        <span v-if="value.routine.pausedUntil > now.getTime()" :class="['rounded-full bg-amber-500/15 px-2 py-1']">{{ t('routines.widgets.paused') }}</span>
        <span :class="['break-all opacity-65']">{{ presentation.date(value.date) }} · {{ value.timeZone }}</span>
      </div>
      <div :class="['min-h-0 flex-1 overflow-y-auto overscroll-contain']">
        <template v-if="value.mode === 'next'">
          <p :class="['mb-2 mt-0 text-sm text-primary-600 dark:text-primary-300']">
            {{ next ? t('routines.widgets.startsIn', { minutes: presentation.number(remaining) }) : t('routines.widgets.noNext') }}
          </p>
          <RoutineEvent v-if="next" :event="next" :time-zone="value.timeZone" :now="now.getTime()" :date="value.date" />
          <template v-if="future[1]">
            <p :class="['mb-2 mt-4 text-xs opacity-65']">
              {{ t('routines.widgets.afterwards') }}
            </p>
            <RoutineEvent :event="future[1]" :time-zone="value.timeZone" :now="now.getTime()" :date="value.date" />
          </template>
          <template v-if="current">
            <p :class="['mb-2 mt-4 text-xs opacity-65']">
              {{ t('routines.widgets.now') }}
            </p>
            <RoutineEvent :event="current" :time-zone="value.timeZone" :now="now.getTime()" :date="value.date" />
          </template>
        </template>
        <template v-else>
          <div :class="['mb-3 flex items-center justify-between gap-2']">
            <h2 :class="['m-0 min-w-0 break-words text-lg font-medium [overflow-wrap:anywhere]']">
              {{ value.routine.title || t('routines.widgets.agenda') }}
            </h2>
            <GhostButton :class="['shrink-0 rounded-lg text-xs']" :aria-pressed="clock" @click="clock = !clock">
              {{ t(clock ? 'routines.widgets.list' : 'routines.widgets.clock') }}
            </GhostButton>
          </div>
          <svg v-if="clock" viewBox="0 0 240 240" :class="['mx-auto block w-full max-w-68']" role="img" :aria-label="t('routines.widgets.clockLabel')">
            <circle cx="120" cy="120" r="90" fill="none" stroke="currentColor" stroke-width="16" :style="{ opacity: 0.08 }" />
            <path
              v-for="item in events" :key="`${item.activityId}:${item.date}`"
              :data-clock-activity="item.activityId"
              class="routine-clock-segment" pathLength="1"
              :d="clockArc(...clockInterval(item.startAt, item.endAt, value.date, value.timeZone))"
              fill="none" :stroke="item.color" stroke-width="16" :style="{ opacity: item.status === 'completed' ? 0.4 : 0.9 }"
            ><title>{{ presentation.label(item).displayLabel }}</title></path>
            <text v-for="hour in [0, 6, 12, 18]" :key="hour" :x="120 + (clockPoint(hour * 60).x - 120) * 1.23" :y="124 + (clockPoint(hour * 60).y - 120) * 1.23" text-anchor="middle" fill="currentColor" :style="{ fontSize: '11px' }">{{ presentation.hour(hour) }}</text>
            <g :style="{ opacity: 0.3 }">
              <line v-for="tick in 60" :key="tick" x1="120" y1="44" x2="120" :y2="tick % 5 === 0 ? 50 : 47" stroke="currentColor" stroke-width="0.7" :style="{ transform: `rotate(${tick * 6}deg)`, transformOrigin: '120px 120px' }" />
            </g>
            <g :key="`${value.date}:${value.timeZone}:day`" data-clock-hand="day" class="routine-clock-hand" :style="{ transform: `rotate(${rotation}deg)` }">
              <line x1="120" y1="120" x2="120" y2="30" stroke="currentColor" stroke-width="2" />
              <circle cx="120" cy="30" r="4" fill="currentColor" />
            </g>
            <g :key="`${value.date}:${value.timeZone}:minute`" data-clock-hand="minute" :class="['routine-minute-hand text-primary-600 dark:text-primary-300']" :style="{ transform: `rotate(${handsRotation * 24}deg)` }">
              <line x1="120" y1="120" x2="120" y2="61" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            </g>
            <g :key="`${value.date}:${value.timeZone}:second`" data-clock-hand="second" :class="['routine-second-hand text-rose-500 dark:text-rose-300']" :style="{ transform: `rotate(${handsRotation * 1440}deg)` }">
              <line x1="120" y1="132" x2="120" y2="48" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
            </g>
            <circle cx="120" cy="120" r="3" fill="currentColor" />
            <text x="120" y="148" text-anchor="middle" fill="currentColor" :style="{ fontSize: '11px' }">{{ t('routines.widgets.dayHand') }}</text>
          </svg>
          <div v-if="clock" :class="['mb-4 flex flex-col items-center gap-2']">
            <time :class="['text-sm tabular-nums']">{{ clockTime }}</time>
            <div :class="['flex flex-wrap justify-center gap-3 text-xs']">
              <span>{{ t('routines.widgets.dayHand') }}</span>
              <span :class="['text-primary-600 dark:text-primary-300']">{{ t('routines.widgets.minuteHand') }}</span>
              <span :class="['text-rose-500 dark:text-rose-300']">{{ t('routines.widgets.secondHand') }}</span>
            </div>
          </div>
          <div :class="['flex flex-col gap-2']">
            <RoutineEvent v-for="item in pending" :key="`${item.activityId}:${item.date}`" :event="item" :time-zone="value.timeZone" :now="now.getTime()" :date="value.date" />
          </div>
          <p v-if="!events.length" :class="['text-sm opacity-70']">
            {{ t('routines.widgets.noEvents') }}
          </p>
          <template v-if="completed.length">
            <h3 :class="['mb-2 mt-4 text-xs font-medium opacity-70']">
              {{ t('routines.widgets.completed') }}
            </h3>
            <div :class="['flex flex-col gap-2']">
              <RoutineEvent v-for="item in completed" :key="`${item.activityId}:${item.date}`" :event="item" :time-zone="value.timeZone" :now="now.getTime()" :date="value.date" />
            </div>
          </template>
        </template>
      </div>
      <footer :class="['mt-3 text-xs opacity-55']">
        {{ t('routines.widgets.snapshot', { time: updated }) }}
      </footer>
    </template>
  </section>
</template>

<style scoped>
.routine-card {
  animation: routine-card-in 180ms ease-out both;
}

.routine-clock-segment {
  stroke-dasharray: 1;
  animation: routine-draw 650ms ease-out both;
}

.routine-clock-hand {
  transform-origin: 120px 120px;
  transition: transform 15s linear;
}

.routine-minute-hand,
.routine-second-hand {
  transform-origin: 120px 120px;
  transition: transform 1s linear;
}

@keyframes routine-card-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes routine-draw {
  from { stroke-dashoffset: 1; }
  to { stroke-dashoffset: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .routine-card,
  .routine-clock-segment {
    animation: none;
  }

  .routine-clock-hand,
  .routine-minute-hand,
  .routine-second-hand {
    transition: none;
  }
}
</style>
