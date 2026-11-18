<script setup lang="ts">
import type { TimelineSpan, TimelineTrack } from '@proj-airi/trace-kit/projections'

import { hashColor } from '@proj-airi/trace-kit/views'
import { useTheme } from '@proj-airi/ui'
import { upperFirst } from 'es-toolkit'
import { computed } from 'vue'

import { spanFacts } from '../../models/trace-lookup'
import { themedColor } from '../../utils/colors'

/**
 * A span that a link of the detail panel points to, as a small card: the track color, the name, the duration, the
 * activity and track, and a status other than `ok`. A click selects the span.
 */
const props = defineProps<{
  span: TimelineSpan
  track?: TimelineTrack
}>()

const emit = defineEmits<{
  select: []
}>()

const facts = computed(() => spanFacts(props.span, props.track))
const { isDark } = useTheme()
const color = computed(() => themedColor(props.track?.definition?.color ?? hashColor(props.span.track), isDark.value, 'accent'))
</script>

<template>
  <button
    type="button"
    :class="[
      'flex w-full min-w-0 items-stretch gap-2 rounded-lg px-2 py-1.5 text-left',
      'bg-neutral-50 ring-1 ring-neutral-200/80 dark:bg-neutral-900 dark:ring-neutral-800',
      'transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
    ]"
    @click="emit('select')"
  >
    <span :class="['w-1 shrink-0 rounded-full']" :style="{ backgroundColor: color }" />
    <span :class="['flex min-w-0 flex-1 flex-col gap-0.5']">
      <span :class="['flex min-w-0 items-baseline gap-2']">
        <span :class="['flex-1 truncate font-medium text-neutral-800 dark:text-neutral-100']">{{ props.span.name }}</span>
        <span :class="['shrink-0 tabular-nums text-neutral-500']">{{ facts.duration }}</span>
      </span>
      <span :class="['truncate text-neutral-500']">
        {{ [facts.activity && upperFirst(facts.activity), props.span.track].filter(Boolean).join(' · ') }}
      </span>
      <span v-if="facts.status" :class="['flex items-center gap-1 text-red-600 dark:text-red-400']">
        <span :class="['i-mingcute:alert-line size-3.5 shrink-0']" />
        <span :class="['truncate']">{{ upperFirst(facts.status) }}</span>
      </span>
    </span>
  </button>
</template>
