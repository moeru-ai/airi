<script setup lang="ts">
import type { HearingPlaygroundSegment } from '@proj-airi/stage-ui/composables'

import { useObjectUrl } from '@vueuse/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  number: number
  segment: HearingPlaygroundSegment
}>()

const { t } = useI18n()
const recording = computed(() => props.segment.recording)
const audioUrl = useObjectUrl(recording)
</script>

<template>
  <li
    :class="[
      'flex flex-col gap-3',
      'px-3 py-2',
    ]"
    data-testid="hearing-playground-segment"
    :data-status="segment.status"
  >
    <audio
      v-if="audioUrl"
      :src="audioUrl"
      :aria-label="t('settings.pages.modules.hearing.sections.section.playground.segment', { number })"
      controls
      :class="['mb-2', 'w-full']"
    />
    <div :class="['flex items-center gap-2', 'text-xs text-neutral-400 dark:text-neutral-500']">
      <span>{{ t('settings.pages.modules.hearing.sections.section.playground.segment', { number }) }}</span>
      <span
        v-if="segment.status === 'transcribing'"
        :class="['flex items-center gap-1', 'text-primary-500 dark:text-primary-400']"
      >
        <span class="animate-spin" i-solar:spinner-line-duotone />
        {{ t('settings.pages.modules.hearing.sections.section.playground.transcribing') }}
      </span>
    </div>

    <p
      v-if="segment.status === 'complete'"
      :class="['whitespace-pre-wrap', 'text-sm text-neutral-700 dark:text-neutral-200']"
      data-testid="hearing-playground-transcript"
    >
      {{ segment.text }}
    </p>
    <p v-else-if="segment.status === 'empty'" :class="['text-sm text-neutral-400 italic', 'dark:text-neutral-500']">
      {{ t('settings.pages.modules.hearing.sections.section.playground.no-transcription') }}
    </p>
    <p v-else-if="segment.status === 'error'" :class="['text-sm text-red-500', 'dark:text-red-400']">
      {{ segment.error || t('settings.pages.modules.hearing.sections.section.playground.transcription-failed') }}
    </p>
  </li>
</template>
