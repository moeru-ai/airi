<script setup lang="ts">
import type { Weekday } from '@proj-airi/core-agent'

import { Button } from '@proj-airi/ui'
import { useI18n } from 'vue-i18n'

import { WEEK, weekdayLabel } from './weekdays'

defineProps<{
  label: string
  description?: string
}>()

const days = defineModel<Weekday[]>({ required: true })

const { locale } = useI18n()

function toggle(day: Weekday) {
  days.value = days.value.includes(day) ? days.value.filter(entry => entry !== day) : [...days.value, day]
}
</script>

<template>
  <div :class="['flex flex-col', 'gap-2']">
    <div>
      <div :class="['text-sm font-medium']">
        {{ label }}
      </div>
      <div v-if="description" :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
        {{ description }}
      </div>
    </div>
    <div :class="['flex flex-wrap', 'gap-1']">
      <Button
        v-for="day in WEEK"
        :key="day"
        size="sm"
        :variant="days.includes(day) ? 'primary' : 'secondary'"
        :label="weekdayLabel(day, locale)"
        :aria-pressed="days.includes(day)"
        @click="toggle(day)"
      />
    </div>
  </div>
</template>
