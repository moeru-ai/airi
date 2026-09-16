<script setup lang="ts">
import type { HearingPlaygroundSegment } from '@proj-airi/stage-ui/composables'

import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import HearingPlaygroundSegmentItem from './hearing-playground-segment.vue'

const props = defineProps<{
  current: string
  isMonitoring: boolean
  segments: readonly HearingPlaygroundSegment[]
}>()

const { t } = useI18n()
const reversedSegments = computed(() => props.segments.toReversed())
</script>

<template>
  <div
    :class="['mb-4 min-h-28', 'rounded-xl']"
    data-testid="hearing-playground-transcripts"
    aria-live="polite"
  >
    <ol
      v-if="current || segments.length"
      v-auto-animate
      :class="[
        'max-h-xs flex flex-col overflow-y-auto',
        'rounded-xl bg-neutral-100 dark:bg-neutral-900',
      ]"
    >
      <li
        v-if="current"
        :class="[
          'rounded-lg px-3 py-2',
          'bg-primary-50 dark:bg-primary-900/20',
        ]"
        data-testid="hearing-playground-current"
      >
        <div :class="['mb-1', 'text-xs text-primary-600 font-medium dark:text-primary-400']">
          {{ t('settings.pages.modules.hearing.sections.section.playground.current') }}
        </div>
        <p :class="['whitespace-pre-wrap', 'text-sm text-neutral-700 dark:text-neutral-200']">
          {{ current }}
        </p>
      </li>

      <HearingPlaygroundSegmentItem
        v-for="(segment, index) in reversedSegments"
        :key="segment.id"
        :number="segments.length - index"
        :segment="segment"
      />
    </ol>

    <div
      v-else-if="isMonitoring"
      :class="[
        'min-h-20 flex items-center justify-center gap-2',
        'text-sm text-neutral-400 dark:text-neutral-500',
      ]"
    >
      <div class="animate-pulse" i-solar:microphone-3-line-duotone />
      {{ t('settings.pages.modules.hearing.sections.section.playground.listening') }}
    </div>

    <div
      v-else
      :class="[
        'min-h-20 flex items-center justify-center text-center',
        'text-sm text-neutral-400 dark:text-neutral-500',
      ]"
    >
      {{ t('settings.pages.modules.hearing.sections.section.playground.empty') }}
    </div>
  </div>
</template>
