<script setup lang="ts">
import type { TurnStages } from '../../composables/turn-stages'

import { useVoiceStore, VOICE_TUNING_DEFAULTS } from '@proj-airi/stage-ui/stores/voice'
import { FieldRange } from '@proj-airi/ui'
import { computed } from 'vue'

import { formatMs, metaNumber } from '../../composables/turn-stages'
import { useVadScores } from '../../composables/use-vad-scores'

const props = defineProps<{
  /** The selected turn. Undefined shows only the live scores. */
  stages?: TurnStages
}>()

/** The chart shows this much of the recent scores. */
const CHART_MS = 10_000
const WIDTH = 600
const HEIGHT = 96

const voice = useVoiceStore()
const { scores } = useVadScores(CHART_MS)

const chart = computed(() => {
  const latest = scores.value.at(-1)?.audioMs ?? 0
  const x = (audioMs: number) => ((audioMs - (latest - CHART_MS)) / CHART_MS * WIDTH).toFixed(1)
  const y = (value: number) => ((1 - value) * HEIGHT).toFixed(1)
  return {
    score: scores.value.map(item => `${x(item.audioMs)},${y(item.score)}`).join(' '),
    // A step line, because the threshold changes only between windows.
    threshold: scores.value.flatMap((item, index) => {
      const previous = scores.value[index - 1]
      return previous && previous.threshold !== item.threshold ? [`${x(item.audioMs)},${y(previous.threshold)}`, `${x(item.audioMs)},${y(item.threshold)}`] : [`${x(item.audioMs)},${y(item.threshold)}`]
    }).join(' '),
    speech: scores.value.filter(item => item.score >= item.threshold).map(item => ({ x: x(item.audioMs - item.durationMs), width: (item.durationMs / CHART_MS * WIDTH).toFixed(1) })),
  }
})

const segments = computed(() => {
  const start = props.stages?.voiceInput?.startTs
  return (props.stages?.speech ?? []).map(span => ({
    id: span.id,
    onsetMs: start === undefined ? undefined : span.startTs - start,
    lengthMs: span.endTs === undefined ? undefined : span.endTs - span.startTs,
    speechMs: metaNumber(span, 'audio_duration_ms'),
  }))
})
</script>

<template>
  <div :class="['flex flex-col gap-3']">
    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      The score of each 32 ms window over the last {{ CHART_MS / 1000 }} s of audio. Speech starts above the threshold line. During an input, the threshold drops to 30 percent, so short dips do not end the speech.
    </p>
    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      preserveAspectRatio="none"
      :class="['h-24 w-full rounded bg-neutral-100 dark:bg-neutral-800']"
      role="img"
      aria-label="VAD scores"
    >
      <rect v-for="(item, index) in chart.speech" :key="index" :x="item.x" y="0" :width="item.width" :height="HEIGHT" :class="['fill-primary-500/15']" />
      <polyline :points="chart.threshold" fill="none" stroke-dasharray="4 3" :class="['stroke-amber-500']" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      <polyline :points="chart.score" fill="none" :class="['stroke-primary-500']" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    </svg>
    <p v-if="!scores.length" :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      No scores. Only the voice host of this page reports them, while it listens.
    </p>

    <div :class="['flex flex-col gap-4']">
      <FieldRange
        v-model="voice.tuning.vadThreshold"
        as="div"
        label="Threshold"
        :default-value="VOICE_TUNING_DEFAULTS.vadThreshold"
        :min="0.05" :max="0.95" :step="0.05"
        :format-value="value => value.toFixed(2)"
      />
      <FieldRange
        v-model="voice.tuning.minSpeechMs"
        as="div"
        label="Minimum speech"
        description="Shorter speech is dropped when silence ends the input."
        :default-value="VOICE_TUNING_DEFAULTS.minSpeechMs"
        :min="0" :max="1500" :step="20"
        :format-value="value => `${value} ms`"
      />
      <FieldRange
        v-model="voice.tuning.preRollMs"
        as="div"
        label="Pre-roll"
        description="Audio kept before the speech onset. It applies when the voice host starts again."
        :default-value="VOICE_TUNING_DEFAULTS.preRollMs"
        :min="0" :max="1000" :step="20"
        :format-value="value => `${value} ms`"
      />
    </div>
    <p :class="['text-xs text-neutral-500 dark:text-neutral-400']">
      These values apply to this window only, and a reload restores them. The silence that ends an input is in the end of turn panel.
    </p>

    <table v-if="segments.length" :class="['w-full text-left text-sm']">
      <thead :class="['text-xs text-neutral-500 dark:text-neutral-400']">
        <tr>
          <th :class="['py-1 pr-3 font-normal']">
            Onset
          </th>
          <th :class="['py-1 pr-3 font-normal']">
            Segment
          </th>
          <th :class="['py-1 font-normal']">
            Speech in it
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="segment in segments" :key="segment.id" :class="['border-t border-neutral-200 dark:border-neutral-700']">
          <td :class="['py-1 pr-3 font-mono']">
            {{ segment.onsetMs === undefined ? '—' : `+${formatMs(segment.onsetMs)}` }}
          </td>
          <td :class="['py-1 pr-3 font-mono']">
            {{ formatMs(segment.lengthMs) }}
          </td>
          <td :class="['py-1 font-mono']">
            {{ formatMs(segment.speechMs) }}
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="stages" :class="['text-sm text-neutral-500 dark:text-neutral-400']">
      The selected turn has no speech segment. An input from a control, such as Push to Talk, has none.
    </p>
  </div>
</template>
