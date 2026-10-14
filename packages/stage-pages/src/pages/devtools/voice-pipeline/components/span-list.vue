<script setup lang="ts">
import type { Hypothesis, UncertainSpan } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'

import { joinTokens } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'

const props = defineProps<{
  spans: readonly UncertainSpan[]
  reference: Hypothesis
}>()

const emit = defineEmits<{
  /** Seconds of the clip where the span starts, for playback from that point. */
  seek: [seconds: number]
}>()

function referenceText(span: UncertainSpan) {
  return joinTokens(props.reference.tokens.slice(span.tokenStart, span.tokenEnd).map(token => token.text))
}
</script>

<template>
  <div :class="['flex flex-col gap-2']">
    <p v-if="props.spans.length === 0" :class="['text-sm text-neutral-500']">
      No spans at these thresholds.
    </p>
    <button
      v-for="(span, index) in props.spans"
      :key="index"
      type="button"
      :class="['flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg p-2 text-left text-sm', 'bg-neutral-100 dark:bg-neutral-800', 'hover:bg-neutral-200 dark:hover:bg-neutral-700']"
      @click="emit('seek', span.start ?? 0)"
    >
      <span :class="['font-mono text-xs', { 'text-amber-600': span.kind === 'unstable', 'text-red-600': span.kind === 'dropped', 'text-violet-600': span.kind === 'untranscribed' }]">{{ span.kind }}</span>
      <span v-if="span.start !== undefined && span.end !== undefined" :class="['font-mono text-xs text-neutral-500']">{{ span.start.toFixed(2) }}-{{ span.end.toFixed(2) }} s</span>
      <span v-if="span.kind === 'unstable'">"{{ referenceText(span) }}"</span>
      <span :class="['text-neutral-500']">
        {{ span.variants.map(variant => `${variant.text || '(nothing)'} ×${variant.count}`).join(', ') }}
      </span>
    </button>
  </div>
</template>
