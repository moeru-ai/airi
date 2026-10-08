<script setup lang="ts">
import { BasicButton } from '@proj-airi/ui'
import { differenceInCalendarDays, intlFormat, intlFormatDistance, isSameYear } from 'date-fns'
import { computed, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  timestamp: number
  now: number
}>()

const { locale } = useI18n()
const showFullDate = shallowRef(false)
const date = computed(() => new Date(props.timestamp))
const fullLabel = computed(() => intlFormat(date.value, {
  dateStyle: 'medium',
  timeStyle: 'short',
}, { locale: locale.value }))

const readableLabel = computed(() => {
  const today = new Date(props.now)
  const time = intlFormat(date.value, { hour: '2-digit', minute: '2-digit' }, { locale: locale.value })
  const daysAgo = differenceInCalendarDays(today, date.value)
  if (daysAgo === 0)
    return time

  if (daysAgo === 1 || daysAgo === 2) {
    const day = intlFormatDistance(date.value, today, { locale: locale.value, unit: 'day', numeric: 'auto' })
    return `${day} ${time}`
  }

  const day = intlFormat(date.value, {
    year: isSameYear(date.value, today) ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  }, { locale: locale.value })
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
