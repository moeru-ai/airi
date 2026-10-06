<script setup lang="ts">
import { BasicButton } from '@proj-airi/ui'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  timestamp: number
  now: number
}>()

const { locale } = useI18n()
const showFullDate = shallowRef(false)
const date = computed(() => new Date(props.timestamp))
const fullLabel = computed(() => new Intl.DateTimeFormat(locale.value, {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(date.value))

function isSameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate()
}

const readableLabel = computed(() => {
  const today = new Date(props.now)
  const time = new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(date.value)
  if (isSameDay(date.value, today))
    return time

  const relativeFormatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  for (const daysAgo of [1, 2]) {
    const previousDay = new Date(today)
    previousDay.setDate(today.getDate() - daysAgo)
    if (isSameDay(date.value, previousDay))
      return `${relativeFormatter.format(-daysAgo, 'day')} ${time}`
  }

  const day = new Intl.DateTimeFormat(locale.value, {
    year: date.value.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date.value)
  return `${day} ${time}`
})
</script>

<template>
  <div :class="['w-full py-3 text-center text-xs', 'text-neutral-500 dark:text-neutral-400']">
    <BasicButton
      type="button"
      size="unset"
      :aria-pressed="showFullDate"
      :title="fullLabel"
      :class="[
        'rounded px-2 py-1 text-xs font-normal',
        'hover:text-neutral-700 dark:hover:text-neutral-200',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400',
      ]"
      @click="showFullDate = !showFullDate"
    >
      <time :datetime="date.toISOString()">{{ showFullDate ? fullLabel : readableLabel }}</time>
    </BasicButton>
  </div>
</template>
