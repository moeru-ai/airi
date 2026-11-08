<script setup lang="ts">
import type { WeatherEffect } from '../../../components/weather/condition-icons'

import { computed } from 'vue'

import Skeleton from './Skeleton.vue'

import { weatherIconMap } from '../../../components/weather/condition-icons'

type SizePreset = 's' | 'm' | 'l' | { cols?: number, rows?: number }

const props = withDefaults(defineProps<{
  propsLoading?: boolean

  city?: string
  /** Which moment or day the widget shows, for example `Now`, `Tomorrow`, or a date. */
  label?: string
  /** The forecast day, `YYYY-MM-DD`. The weather tool sends it with each daily entry. */
  date?: string
  temperature?: string
  condition?: string
  icon?: string
  conditionCode?: string
  isNight?: boolean
  effect?: WeatherEffect
  size?: SizePreset
  high?: string
  low?: string
  feelsLike?: string
  humidity?: string
  wind?: string
  precipitation?: string
}>(), {
  propsLoading: false,
  isNight: false,
})

const normalizedCondition = computed(() => (props.condition ?? '').toLowerCase().trim())
const normalizedCode = computed(() => (props.conditionCode ?? '').toLowerCase().trim())
const isLarge = computed(() => props.size === 'l')
const place = computed(() => [props.city ?? 'Unknown', props.label].filter(Boolean).join(' · '))

const conditionMappings: Array<{ keywords: string[], key: string }> = [
  { keywords: ['thunder', 'storm', 'lightning'], key: 'thunderstorm' },
  { keywords: ['hurricane', 'typhoon', 'cyclone'], key: 'hurricane' },
  { keywords: ['tornado'], key: 'tornado' },
  { keywords: ['hail'], key: 'hail' },
  { keywords: ['sleet', 'ice'], key: 'sleet' },
  { keywords: ['snow', 'blizzard', 'flurries'], key: 'snow' },
  { keywords: ['extreme rain', 'heavy rain', 'downpour'], key: 'extreme-rain' },
  { keywords: ['rain', 'shower'], key: 'rain' },
  { keywords: ['drizzle', 'sprinkle'], key: 'drizzle' },
  { keywords: ['fog'], key: 'fog' },
  { keywords: ['mist'], key: 'mist' },
  { keywords: ['haze'], key: 'haze' },
  { keywords: ['dust', 'sand'], key: 'dust' },
  { keywords: ['smoke'], key: 'smoke' },
  { keywords: ['overcast'], key: 'overcast' },
  { keywords: ['cloud'], key: 'cloudy' },
  { keywords: ['partly', 'mostly', 'scattered'], key: 'partly-cloudy-day' },
  { keywords: ['wind', 'breezy', 'gust'], key: 'wind' },
  { keywords: ['clear', 'sun', 'fair'], key: 'clear-day' },
]

function isWeatherIconKey(input: string): input is string {
  return input in weatherIconMap
}

const resolvedIconKey = computed<string>(() => {
  if (props.icon)
    return props.icon

  const direct = normalizedCode.value
  if (direct && isWeatherIconKey(direct))
    return direct

  const match = conditionMappings.find(({ keywords }) => keywords.some(keyword => normalizedCondition.value.includes(keyword)))
  const fallback: string = props.isNight ? 'clear-night' : 'clear-day'
  const baseKey = match?.key ?? fallback
  const config = weatherIconMap[baseKey]

  if (props.isNight && config.nightKey)
    return config.nightKey

  return baseKey
})

const resolvedIconClass = computed(() => weatherIconMap[resolvedIconKey.value].icon)
</script>

<template>
  <div :class="['relative', 'h-full', 'w-full', 'font-sans']">
    <Skeleton
      v-if="props.propsLoading"
      :class="['grid', 'grid-cols-4', 'grid-rows-3', 'max-h-35', 'gap-2', 'rounded-2xl', 'py-2', 'pl-3', 'pr-1']"
    >
      <Skeleton
        animation="wave"
        :class="['col-span-3', 'h-[1lh]', 'w-20%', 'rounded-2xl']"
      />
      <div
        :class="['col-span-1', 'row-span-2', 'h-20', 'w-20', 'justify-self-end']"
      />
      <Skeleton
        animation="wave"
        :class="['col-span-2', 'row-span-2', 'h-full', 'w-20%', 'inline-flex', 'items-end', 'rounded-2xl', 'text-gray-600', 'font-thin', 'dark:text-gray-300']"
      />
      <Skeleton
        animation="wave"
        :class="['col-span-2', 'row-span-1', 'h-full', 'w-20%', 'inline-flex', 'items-end', 'justify-self-end', 'rounded-2xl', 'pr-4', 'text-gray-500', 'dark:text-gray-400']"
      />
    </Skeleton>
    <!-- TODO: Yeah I know for Windows, rounded corner is not applied properly when background material used -->
    <!-- https://github.com/electron/electron/issues/48340 -->
    <!-- https://issues.chromium.org/issues/432457523 -->
    <div
      v-else
      :class="[
        'relative',
        'flex',
        'h-full',
        'flex-col',
        'justify-between',
        'gap-3',
        'overflow-x-hidden overflow-y-scroll scrollbar-none',
        'p-3',
        'rounded-2xl',
        'bg-gradient-to-br',
        'from-neutral-950/65',
        'via-neutral-900/65',
        'to-neutral-800/65',
        'text-white',
      ]"
    >
      <div
        aria-hidden="true"
        :class="[
          'pointer-events-none',
          'absolute',
          '-right-8',
          '-top-10',
          'size-32',
          'rounded-full',
          'bg-gradient-to-br',
          'from-white/30',
          'via-white/5',
          'to-transparent',
          'blur-xl',
        ]"
      />
      <div v-if="isLarge" :class="['relative', 'z-1', 'flex', 'h-full', 'flex-col', 'justify-between', 'gap-4']">
        <div :class="['flex', 'items-center', 'justify-center']">
          <div
            aria-hidden="true"
            :class="[
              'text-[6rem]',
              'leading-none',
              'text-white/95',
              'drop-shadow-[0_12px_30px_rgba(0,0,0,0.55)]',
              resolvedIconClass,
            ]"
          />
        </div>
        <div :class="['flex', 'flex-col', 'items-center', 'gap-2']">
          <div :class="['text-[4rem]', 'font-semibold', 'leading-none']">
            {{ props.temperature ?? '--' }}
          </div>
          <div :class="['text-lg', 'text-white/85']">
            {{ props.condition ?? '—' }}
          </div>
          <div :class="['text-sm', 'text-white/55']">
            {{ place }}
          </div>
        </div>
        <div :class="['h-px', 'w-full', 'bg-white/10']" />
        <div :class="['grid', 'grid-cols-3', 'gap-3', 'text-white/80']">
          <div :class="['flex', 'flex-col', 'items-center', 'gap-1']">
            <div :class="['text-4xl', 'leading-none', 'i-iconify-meteocons:wind-fill-static']" />
            <div :class="['text-sm', 'font-semibold']">
              {{ props.wind ?? '--' }}
            </div>
            <div :class="['text-xs', 'text-white/60']">
              Wind
            </div>
          </div>
          <div :class="['flex', 'flex-col', 'items-center', 'gap-1']">
            <div :class="['text-4xl', 'leading-none', 'i-iconify-meteocons:raindrops-fill-static']" />
            <div :class="['text-sm', 'font-semibold']">
              {{ props.precipitation ?? '--' }}
            </div>
            <div :class="['text-xs', 'text-white/60']">
              Chance of rain
            </div>
          </div>
          <div :class="['flex', 'flex-col', 'items-center', 'gap-1']">
            <div :class="['text-4xl', 'leading-none', 'i-iconify-meteocons:humidity-fill-static']" />
            <div :class="['text-sm', 'font-semibold']">
              {{ props.humidity ?? '--' }}
            </div>
            <div :class="['text-xs', 'text-white/60']">
              Humidity
            </div>
          </div>
        </div>
      </div>
      <div v-else :class="['relative', 'z-1', 'flex', 'flex-1', 'flex-col', 'gap-3']">
        <div :class="['flex', 'items-start', 'justify-between', 'gap-4', 'flex-1', 'p-2']">
          <div
            aria-hidden="true"
            :class="[
              'size-40 scale-120',
              'leading-none',
              'text-white/90',
              'drop-shadow-[0_10px_22px_rgba(0,0,0,0.5)]',
              resolvedIconClass,
            ]"
          />
          <div :class="['flex', 'flex-col', 'items-end', 'gap-2']">
            <div :class="['text-sm', 'tracking-wide', 'text-white/80']">
              {{ props.condition ?? '—' }}
            </div>
            <div :class="['text-[3.5rem]', 'font-semibold', 'leading-none']">
              {{ props.temperature ?? '--' }}
            </div>
            <div :class="['text-xs', 'text-white/60']">
              {{ place }}
            </div>
          </div>
        </div>
        <div :class="['h-px', 'w-full', 'bg-white/10']" />
        <div :class="['grid', 'grid-cols-3', 'gap-2', 'text-white/80', 'flex-shrink-0', 'pb-4']">
          <div :class="['flex', 'flex-col', 'items-center', 'gap-1']">
            <div :class="['text-4xl scale-120', 'leading-none', 'i-iconify-meteocons:wind-fill-static']" />
            <div :class="['text-sm', 'font-semibold']">
              {{ props.wind ?? '--' }}
            </div>
            <div :class="['text-xs', 'text-white/60']">
              Wind
            </div>
          </div>
          <div :class="['flex', 'flex-col', 'items-center', 'gap-1']">
            <div :class="['text-4xl scale-120', 'leading-none', 'i-iconify-meteocons:raindrops-fill-static']" />
            <div :class="['text-sm', 'font-semibold']">
              {{ props.precipitation ?? '--' }}
            </div>
            <div :class="['text-xs', 'text-white/60']">
              Chance of rain
            </div>
          </div>
          <div :class="['flex', 'flex-col', 'items-center', 'gap-1']">
            <div :class="['text-4xl scale-120', 'leading-none', 'i-iconify-meteocons:humidity-fill-static']" />
            <div :class="['text-sm', 'font-semibold']">
              {{ props.humidity ?? '--' }}
            </div>
            <div :class="['text-xs', 'text-white/60']">
              Humidity
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>

<route lang="yaml">
meta:
  layout: plain
</route>
