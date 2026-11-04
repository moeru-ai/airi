<script setup lang="ts">
import type { WeatherReport } from '../../stores/tools/builtin/weather'

import { TransitionVertical } from '@proj-airi/ui'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { weatherIconMap } from '../weather/condition-icons'

/**
 * The report of one weather call, as drawers: the current weather first, then one drawer for each forecast day.
 * One drawer is open at a time. Opening another one closes it.
 */
const props = defineProps<{
  report: WeatherReport
}>()

const { t, te, locale } = useI18n()
const KEY = 'tamagotchi.stage.weather-tool-call'

const drawers = computed(() => {
  // The weather tool names the days "Today", "Tomorrow", and then dates. The browser words them in the user's language.
  const relative = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  const calendar = new Intl.DateTimeFormat(locale.value, { weekday: 'short', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
  const { current, daily } = props.report

  return [
    {
      key: 'now',
      label: relative.format(0, 'second'),
      conditionCode: current.conditionCode,
      condition: current.condition,
      temperature: current.temperature,
      facts: [
        { icon: 'i-iconify-meteocons:thermometer-fill', value: current.feelsLike, label: t(`${KEY}.feels-like`) },
        { icon: 'i-iconify-meteocons:humidity-fill', value: current.humidity, label: t(`${KEY}.humidity`) },
        { icon: 'i-iconify-meteocons:wind-fill', value: current.wind, label: t(`${KEY}.wind`) },
        { icon: 'i-iconify-meteocons:raindrops-fill', value: current.precipitation, label: t(`${KEY}.precipitation`) },
      ],
    },
    ...daily.map((day, index) => ({
      key: day.date,
      label: index < 2 ? relative.format(index, 'day') : calendar.format(new Date(`${day.date}T00:00:00Z`)),
      conditionCode: day.conditionCode,
      condition: day.condition,
      temperature: day.temperature,
      facts: [
        { icon: 'i-iconify-meteocons:thermometer-warmer-fill', value: day.high, label: t(`${KEY}.high`) },
        { icon: 'i-iconify-meteocons:thermometer-colder-fill', value: day.low, label: t(`${KEY}.low`) },
        { icon: 'i-iconify-meteocons:wind-fill', value: day.wind, label: t(`${KEY}.wind`) },
        { icon: 'i-iconify-meteocons:raindrops-fill', value: day.precipitation, label: t(`${KEY}.precipitation`) },
      ],
    })),
  ]
})

// An imported chat can hold a code that the icon table does not know. It shows the icon for an unknown condition.
function conditionIcon(code: string) {
  return weatherIconMap[code]?.icon ?? 'i-iconify-meteocons:not-available-fill'
}

// The icon table knows more codes than the weather tool sends today. A code without words here shows the condition text of the tool.
function conditionLabel(drawer: { conditionCode: string, condition: string }) {
  const key = `${KEY}.conditions.${drawer.conditionCode}`
  return te(key) ? t(key) : drawer.condition
}

const openKey = ref<string>('now')

function toggle(key: string) {
  openKey.value = openKey.value === key ? '' : key
}
</script>

<template>
  <div :class="['flex flex-col gap-2 rounded-xl p-3', 'bg-white/75 dark:bg-neutral-800/60']">
    <span :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">{{ props.report.location.city }} · {{ props.report.location.country }} · {{ props.report.location.timezone }}</span>
    <div :class="['flex flex-col']">
      <div
        v-for="(drawer, index) in drawers"
        :key="drawer.key"
        :class="[index > 0 ? 'border-t border-neutral-100 dark:border-neutral-700/60' : '']"
      >
        <button
          type="button"
          :aria-expanded="openKey === drawer.key"
          :class="[
            'w-full grid grid-cols-[4.75rem_minmax(0,1fr)_auto_0.875rem] items-center gap-2.5 rounded-lg px-1 py-1.5 text-start text-xs',
            'outline-none transition-colors duration-200',
            'hover:bg-neutral-100/80 dark:hover:bg-neutral-900/50',
            'focus-visible:ring-2 focus-visible:ring-primary-400/60',
          ]"
          @click="toggle(drawer.key)"
        >
          <span :class="['truncate', 'text-neutral-500 dark:text-neutral-400']">{{ drawer.label }}</span>
          <span :class="['min-w-0 inline-flex items-center gap-1.5', 'text-neutral-800 dark:text-neutral-100']">
            <span :class="[conditionIcon(drawer.conditionCode), 'shrink-0 text-xl']" aria-hidden="true" />
            <span :class="['truncate']">{{ conditionLabel(drawer) }}</span>
          </span>
          <span :class="['font-semibold tabular-nums', 'text-neutral-800 dark:text-neutral-100']">{{ drawer.temperature }}</span>
          <span
            :class="[
              'i-mingcute:down-line', 'text-sm text-neutral-400',
              'transition-transform duration-250',
              openKey === drawer.key ? 'rotate-180' : '',
            ]"
            aria-hidden="true"
          />
        </button>
        <TransitionVertical>
          <div v-if="openKey === drawer.key" :class="['flex flex-col gap-2.5 px-1 pb-2.5 pt-1']">
            <div :class="['flex items-center gap-3']">
              <span :class="[conditionIcon(drawer.conditionCode), 'shrink-0 text-[52px] leading-none']" aria-hidden="true" />
              <div :class="['flex flex-col gap-0.5']">
                <span :class="['text-[28px] font-semibold leading-tight tabular-nums', 'text-neutral-800 dark:text-neutral-100']">{{ drawer.temperature }}</span>
                <span :class="['text-[13px]', 'text-neutral-600 dark:text-neutral-300']">{{ conditionLabel(drawer) }}</span>
                <!-- The condition code covers several conditions. The text of the tool names the exact one. -->
                <span :class="['text-[11px]', 'text-neutral-400 dark:text-neutral-500']">{{ drawer.condition }}</span>
              </div>
            </div>
            <div :class="['grid grid-cols-4 gap-1.5']">
              <div
                v-for="fact in drawer.facts"
                :key="fact.label"
                :class="['flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5', 'bg-neutral-100 dark:bg-neutral-900/60']"
              >
                <span :class="[fact.icon, 'text-[22px]']" aria-hidden="true" />
                <span :class="['text-xs font-semibold tabular-nums', 'text-neutral-800 dark:text-neutral-100']">{{ fact.value }}</span>
                <span :class="['text-[10px]', 'text-neutral-400 dark:text-neutral-500']">{{ fact.label }}</span>
              </div>
            </div>
          </div>
        </TransitionVertical>
      </div>
    </div>
  </div>
</template>
