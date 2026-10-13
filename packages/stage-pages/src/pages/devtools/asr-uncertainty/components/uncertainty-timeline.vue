<script setup lang="ts">
import type { IntensityContour, TimedToken, TimelineBin, TokenAgreement, UncertainSpan } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'

import { normalizeToken } from '@proj-airi/stage-ui/libs/voice/asr-uncertainty'
import { useElementSize } from '@vueuse/core'
import { computed, useTemplateRef } from 'vue'

const props = defineProps<{
  durationSeconds: number
  contour: IntensityContour
  tokens: readonly TokenAgreement[]
  timeline: readonly TimelineBin[]
  spans: readonly UncertainSpan[]
  /** Tokens of the blank-penalty decode. Undefined when that decode was skipped. */
  probeTokens?: readonly TimedToken[]
  agreementThreshold: number
}>()

const emit = defineEmits<{
  /** Seconds of the clip under the pointer, for playback from that point. */
  seek: [seconds: number]
}>()

/** Vertical bands of the chart, in pixels from the top. */
const rows = {
  intensity: { top: 8, height: 56 },
  curves: { top: 72, height: 48 },
  tokens: { top: 136, height: 28 },
  probe: { top: 176, height: 14 },
  axis: { top: 200 },
} as const
const height = 216

const container = useTemplateRef<HTMLDivElement>('container')
const { width } = useElementSize(container)

function x(seconds: number) {
  return props.durationSeconds === 0 ? 0 : seconds / props.durationSeconds * width.value
}

/**
 * The dB range of the intensity band. The lower bound sits 10 dB under the silence threshold, so silence
 * stays visible as a flat floor. A loop finds the peak, because a long clip has more frames than a call
 * can take as arguments.
 */
const intensityRange = computed(() => {
  const low = props.contour.silenceDb - 10
  return { low, high: props.contour.db.reduce((peak, value) => Math.max(peak, value), low + 1) }
})

const intensityPath = computed(() => {
  const { db, hopSeconds } = props.contour
  if (db.length === 0)
    return ''
  const { low, high } = intensityRange.value
  const { top, height: bandHeight } = rows.intensity
  const y = (value: number) => top + bandHeight * (1 - Math.min(1, Math.max(0, (value - low) / (high - low))))
  return Array.from(db, (value, frame) => `${frame === 0 ? 'M' : 'L'}${x(frame * hopSeconds).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
})

const silenceY = computed(() => {
  const { low, high } = intensityRange.value
  return rows.intensity.top + rows.intensity.height * (1 - (props.contour.silenceDb - low) / (high - low))
})

function curvePath(value: (bin: TimelineBin) => number) {
  const { top, height: bandHeight } = rows.curves
  return props.timeline.map((bin, index) => `${index === 0 ? 'M' : 'L'}${x(bin.start).toFixed(1)},${(top + bandHeight * (1 - value(bin))).toFixed(1)}`).join(' ')
}

const disagreementPath = computed(() => curvePath(bin => bin.disagreement))
const extraEmissionPath = computed(() => curvePath(bin => bin.extraEmission))

/** Punctuation is ignored by the analysis, so it stays gray. Otherwise the color follows the agreement. */
function agreementClass(value: number, punctuation: boolean) {
  if (punctuation)
    return 'fill-neutral-400 dark:fill-neutral-500'
  if (value >= 0.9)
    return 'fill-emerald-600 dark:fill-emerald-400'
  if (value >= props.agreementThreshold)
    return 'fill-amber-600 dark:fill-amber-400'
  return 'fill-red-600 dark:fill-red-400'
}

const timedTokens = computed(() => props.tokens.flatMap((agreement, index) => {
  if (agreement.token.time === undefined)
    return []
  const value = agreement.byTime ?? agreement.byText
  const punctuation = normalizeToken(agreement.token.text) === ''
  return [{
    index,
    text: agreement.token.text.replaceAll('▁', '').trim(),
    x: x(agreement.token.time),
    // Two staggered lines keep neighboring labels from covering each other.
    y: rows.tokens.top + (index % 2 === 0 ? 10 : 24),
    class: agreementClass(value, punctuation),
    title: `${agreement.token.text} at ${agreement.token.time.toFixed(2)} s, by time ${agreement.byTime?.toFixed(2) ?? '-'}, by text ${agreement.byText.toFixed(2)}`,
  }]
}))

const probeLabels = computed(() => (props.probeTokens ?? []).flatMap(token => token.time === undefined
  ? []
  : [{ text: token.text.replaceAll('▁', '').trim(), x: x(token.time) }]))

const spanRects = computed(() => props.spans.flatMap(span => span.start === undefined || span.end === undefined
  ? []
  : [{
      x: x(span.start),
      width: Math.max(2, x(span.end) - x(span.start)),
      class: {
        unstable: 'fill-amber-500/20',
        dropped: 'fill-red-500/20',
        untranscribed: 'fill-violet-500/20',
      }[span.kind],
    }]))

const ticks = computed(() => {
  const step = props.durationSeconds > 20 ? 2 : props.durationSeconds > 8 ? 1 : 0.5
  return Array.from({ length: Math.floor(props.durationSeconds / step) + 1 }, (_, index) => index * step)
})

function handleClick(event: MouseEvent) {
  // `offsetX` counts from the clicked child, such as a token label, so measure from the chart instead.
  const bounds = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
  if (bounds.width > 0)
    emit('seek', Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * props.durationSeconds)
}
</script>

<template>
  <div ref="container" :class="['w-full']">
    <svg
      v-if="width > 0"
      :width="width"
      :height="height"
      :class="['block cursor-pointer select-none']"
      @click="handleClick"
    >
      <rect v-for="(rect, index) in spanRects" :key="`span-${index}`" :x="rect.x" y="0" :width="rect.width" :height="rows.axis.top" :class="rect.class" />

      <text x="4" :y="rows.intensity.top + 10" :class="['fill-neutral-400 text-[10px]']">intensity / nuclei</text>
      <line x1="0" :x2="width" :y1="silenceY" :y2="silenceY" :class="['stroke-neutral-300 dark:stroke-neutral-600']" stroke-dasharray="4 4" />
      <path :d="intensityPath" fill="none" :class="['stroke-neutral-500 dark:stroke-neutral-400']" stroke-width="1" />
      <line
        v-for="(nucleus, index) in contour.nuclei"
        :key="`nucleus-${index}`"
        :x1="x(nucleus)" :x2="x(nucleus)"
        :y1="rows.intensity.top" :y2="rows.intensity.top + rows.intensity.height"
        :class="['stroke-violet-500/60']"
      />

      <text x="4" :y="rows.curves.top + 10" :class="['fill-neutral-400 text-[10px]']">disagreement (amber) / extra emission (red)</text>
      <path :d="disagreementPath" fill="none" :class="['stroke-amber-500']" stroke-width="1.5" />
      <path :d="extraEmissionPath" fill="none" :class="['stroke-red-500']" stroke-width="1.5" />

      <text
        v-for="token in timedTokens"
        :key="`token-${token.index}`"
        :x="token.x" :y="token.y"
        text-anchor="middle"
        :class="['text-[11px] font-mono', token.class]"
      >
        <title>{{ token.title }}</title>{{ token.text }}
      </text>

      <template v-if="probeTokens">
        <text x="4" :y="rows.probe.top - 2" :class="['fill-neutral-400 text-[10px]']">blank-penalty decode</text>
        <text
          v-for="(token, index) in probeLabels"
          :key="`probe-${index}`"
          :x="token.x" :y="rows.probe.top + 10"
          text-anchor="middle"
          :class="['fill-neutral-500 text-[10px] font-mono italic']"
        >
          {{ token.text }}
        </text>
      </template>

      <line x1="0" :x2="width" :y1="rows.axis.top" :y2="rows.axis.top" :class="['stroke-neutral-300 dark:stroke-neutral-700']" />
      <text
        v-for="tick in ticks"
        :key="`tick-${tick}`"
        :x="x(tick)" :y="rows.axis.top + 12"
        text-anchor="middle"
        :class="['fill-neutral-400 text-[10px]']"
      >
        {{ tick }}s
      </text>
    </svg>
  </div>
</template>
