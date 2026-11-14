<script setup lang="ts">
import { ProgressiveBlur } from '@proj-airi/ui'
import { computed } from 'vue'

import { useVoiceWaveLayers, VOICE_WAVE_LAYERS } from '../../../composables/permissions/use-voice-wave-layers'

const props = defineProps<{
  /** What the visual shows, for assistive technology. */
  label: string
  /** How much a voice stands out in each band, from 0 to 1, from the lowest band to the highest, about 30 times a second. */
  bands: readonly number[]
  /** True while the microphone listens. Otherwise the waves rest as thin gray lines. */
  active: boolean
}>()

const VIEW_WIDTH = 400
const VIEW_HEIGHT = 240
const POINTS = 80

const { heights: frameHeights, phasesRadians } = useVoiceWaveLayers(() => props.bands, () => props.active)

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

const shapes = computed(() => VOICE_WAVE_LAYERS.map((layer, index) => ({
  d: mirroredWave(layer.cycles, frameHeights.value[index], phasesRadians.value[index]),
  color: props.active ? layer.color : 'text-neutral-400 dark:text-neutral-600',
  opacity: layer.opacity,
})))
</script>

<template>
  <div role="img" :aria-label="label" :class="['absolute inset-0 overflow-hidden']">
    <!--
      The waves and the blur at their ends share one band. A tall narrow stage does not stretch the waves, and the blur
      covers only the waves, so it does not show as pale bars over a see-through drawer. The microphone page puts
      its result under this band on a narrow page, so the two heights must change together.
    -->
    <div :class="['absolute inset-x-0 top-1/2 h-3/5 max-h-34 -translate-y-1/2 @3xl:max-h-63', '[clip-path:inset(0)]']">
      <svg
        aria-hidden="true"
        :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
        preserveAspectRatio="none"
        :class="['absolute inset-0 h-full w-full', '[mask-image:linear-gradient(to_right,transparent,black_25%,black_75%,transparent)]']"
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
  </div>
</template>
