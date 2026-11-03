<script setup lang="ts">
import { ProgressiveBlur } from '@proj-airi/ui'
import { useRafFn } from '@vueuse/core'
import { createAnimatable } from 'animejs'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

const props = defineProps<{
  /** What the visual shows, for assistive technology. */
  label: string
  /** The level of each voice band from 0 to 1, from the lowest band to the highest, about 30 times a second. */
  bands: readonly number[]
  /** True while the microphone listens. Otherwise the waves rest as thin gray lines. */
  active: boolean
}>()

/** A quiet room reads up to about this level in a band. The waves react only above it. */
const NOISE_FLOOR = 0.15
/** A listening wave keeps this much height, so the user sees that it listens. */
const IDLE_HEIGHT = 0.05
/** A frame after a stall counts at most this long, so the waves do not jump. */
const MAX_FRAME_SECONDS = 0.1

const VIEW_WIDTH = 400
const VIEW_HEIGHT = 240
const POINTS = 80

/**
 * One layer for each band, from back to front. A low band is a wide and slow swell, and a high band is a narrow and fast
 * ripple, so the layers move differently when the voice changes.
 */
const layers = [
  { cycles: 1.2, radiansPerSecond: 0.9, color: 'text-primary-300 dark:text-primary-500', opacity: 0.45 },
  { cycles: 2, radiansPerSecond: -1.4, color: 'text-primary-400 dark:text-primary-400', opacity: 0.4 },
  { cycles: 3.1, radiansPerSecond: 2.1, color: 'text-primary-500 dark:text-primary-300', opacity: 0.35 },
  { cycles: 4.6, radiansPerSecond: -3, color: 'text-primary-600 dark:text-primary-200', opacity: 0.3 },
]

/** A rising wave follows the voice at once, and a falling wave settles slowly, so the layers swell and breathe. */
const RISE_MS = 140
const FALL_MS = 480

/**
 * The drawn height of each layer from 0 to 1. Each band update retargets a running tween, so a height glides from where it
 * is to the new level instead of jumping at 30 Hz.
 */
const heights = layers.map(() => ({ value: 0 }))
const tweens = heights.map(height => createAnimatable(height, { value: 0, ease: 'out(3)' }))

watch(() => [props.bands, props.active] as const, ([bands, active]) => {
  tweens.forEach((tween, index) => {
    const voice = Math.max(0, (bands[index] ?? 0) - NOISE_FLOOR) / (1 - NOISE_FLOOR)
    const target = active ? IDLE_HEIGHT + voice * (1 - IDLE_HEIGHT) : 0
    tween.value(target, target > heights[index].value ? RISE_MS : FALL_MS)
  })
}, { immediate: true })
onScopeDispose(() => tweens.forEach(tween => tween.revert()))

/** The phase of each layer in radians. It moves on each frame, and the shapes read the heights of the same frame. */
const phasesRadians = shallowRef(layers.map((_, index) => index * 1.7))
const frameHeights = shallowRef(heights.map(height => height.value))

useRafFn(({ delta }) => {
  const frameSeconds = Math.min(Math.max(delta, 0) / 1000, MAX_FRAME_SECONDS)
  frameHeights.value = heights.map(height => height.value)
  if (props.active)
    phasesRadians.value = phasesRadians.value.map((phase, index) => phase + layers[index].radiansPerSecond * frameSeconds)
})

/**
 * A closed shape that is mirrored around the middle line. Its half height follows a wave that tapers to nothing at both
 * ends, so each layer grows out of the middle line.
 */
function mirroredWave(cycles: number, height: number, phaseRadians: number) {
  const middle = VIEW_HEIGHT / 2
  const peak = middle * 0.92 * height
  const top: string[] = []
  const bottom: string[] = []
  for (let index = 0; index <= POINTS; index++) {
    const progress = index / POINTS
    const taper = Math.sin(Math.PI * progress) ** 2
    const swell = 0.55 + 0.45 * Math.sin(progress * cycles * Math.PI * 2 + phaseRadians)
    // A thin line stays when the height is 0, so a resting layer still shows.
    const offset = Math.max(0.6, peak * taper * swell)
    const x = (progress * VIEW_WIDTH).toFixed(1)
    top.push(`${x} ${(middle - offset).toFixed(1)}`)
    bottom.push(`${x} ${(middle + offset).toFixed(1)}`)
  }
  return `M${top.join('L')}L${bottom.reverse().join('L')}Z`
}

const shapes = computed(() => layers.map((layer, index) => ({
  d: mirroredWave(layer.cycles, frameHeights.value[index], phasesRadians.value[index]),
  color: props.active ? layer.color : 'text-neutral-400 dark:text-neutral-600',
  opacity: layer.opacity,
})))
</script>

<template>
  <div role="img" :aria-label="label" :class="['absolute inset-0 overflow-hidden']">
    <svg
      aria-hidden="true"
      :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
      preserveAspectRatio="none"
      :class="['absolute inset-x-0 top-1/2 h-3/5 w-full -translate-y-1/2']"
    >
      <path
        v-for="(shape, index) in shapes"
        :key="index"
        :d="shape.d"
        :class="[shape.color, 'transition-colors duration-500']"
        fill="currentColor"
        :fill-opacity="shape.opacity"
      />
    </svg>
    <!-- The ends dissolve into the panel: the blur grows toward each side. -->
    <div :class="['absolute inset-y-0 left-0 w-1/4']">
      <ProgressiveBlur edge="left" :strength="20" />
    </div>
    <div :class="['absolute inset-y-0 right-0 w-1/4']">
      <ProgressiveBlur edge="right" :strength="20" />
    </div>
  </div>
</template>
