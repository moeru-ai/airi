<script setup lang="ts">
import { usePreferredReducedMotion } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'

import { stepSpring, useVoiceWaveLayers, VOICE_WAVE_LAYERS } from '../../../composables/permissions/use-voice-wave-layers'
import { createSimplexNoise3D } from '../../../libs/noise/simplex'

/**
 * The stage of the enrollment.
 *
 * - `idle`: no recording. The circles are small and gray.
 * - `recording`: the circles take the theme color, follow their voice bands, and grow with `progress`.
 * - `full`: the recording has enough speech, and the voiceprint model works or the user reviews the voice. A change
 *   from `recording` to `full` lights the circles and releases particles.
 * - `saved`: a voiceprint is saved. The circles shrink, so they do not draw the eye, and keep a small wobble.
 */
export type VoiceprintCirclesStage = 'idle' | 'recording' | 'full' | 'saved'

const props = defineProps<{
  /** What the visual shows, for assistive technology. */
  label: string
  /** How much a voice stands out in each band, from 0 to 1, from the lowest band to the highest, about 30 times a second. */
  bands: readonly number[]
  stage: VoiceprintCirclesStage
  /** The counted speech, from 0 to 1. The circles grow with it while `stage` is `recording`. */
  progress: number
  /** True while the user decides about a voice that is not like the saved voiceprints. The color fades by half. */
  dimmed?: boolean
}>()

defineSlots<{
  /**
   * Content under the circles, such as the status of a recording. It moves down as the circles grow. It is centered
   * under the circles and can be wider than them, up to 20rem.
   */
  below: (props: Record<string, never>) => unknown
}>()

const VIEW_SIZE = 240
const CENTER = VIEW_SIZE / 2
const POINTS = 72
/** Radii in view units: the idle size, the size of a full recording, and the size of a saved voiceprint. */
const SIZE_IDLE = 28
const SIZE_FULL = 84
const SIZE_SAVED = 25

/**
 * One filled circle for each voice band, from the lowest band to the highest. All four have the same radius, like the
 * waves of the microphone page share one middle line, and each one wobbles with its own band.
 *
 * `wavelength` sets how many bumps a circle has. The outline reads the noise on a circle of radius / wavelength in
 * the noise field. So a large circle has more bumps than a small one. A low band has fewer and slower bumps. `speed`
 * moves the noise field in time. `reach` scales the voice ripple, like the max heights of the microphone waves.
 */
const CIRCLES = [
  { wavelength: 105, speed: 0.55, reach: 1, opacity: 0.28 },
  { wavelength: 92, speed: 0.65, reach: 0.85, opacity: 0.25 },
  { wavelength: 82, speed: 0.75, reach: 0.7, opacity: 0.22 },
  { wavelength: 74, speed: 0.85, reach: 0.55, opacity: 0.19 },
] as const
/** The radius of the sampling circle in the noise field: about two bumps at the low end, four or five at the high end. */
const NOISE_RADIUS_MIN = 0.3
const NOISE_RADIUS_MAX = 1.05
/** Simplex noise mostly stays within ±0.6, so this gain brings its usual peaks to the amplitude. */
const NOISE_GAIN = 1.5
/**
 * The wobble without a voice, and the extra wobble of a band at its full level, as parts of the radius at the full size.
 * A voice makes the wobble only somewhat larger: at most 0.2 for the lowest band, against 0.08 at rest.
 */
const REST_AMPLITUDE = 0.08
const VOICE_AMPLITUDE = 0.12
/** At the saved size, the amplitude is this part of the amplitude at the full size, so a small circle stays calm. */
const SMALL_AMPLITUDE_SCALE = 0.4

/** Growth with the speech is even and does not swing: 90% of a step in 0.5 s. */
const GROW_SPRING = { stiffness: 60, mass: 1, dampingRatio: 1 }
/** The shrink to the saved size swings a little past it: 84 → about 20 at 280 ms, then 25. */
const SHRINK_SPRING = { stiffness: 180, mass: 1, dampingRatio: 0.6 }
/** A new cluster pops in fast: 90% in 150 ms. */
const APPEAR_SPRING = { stiffness: 300, mass: 1, dampingRatio: 0.7 }
/** The light of a full recording fades without a swing: 28% is left after 0.3 s. */
const FLASH_SPRING = { stiffness: 70, mass: 1, dampingRatio: 1 }
const FADE_SPRING = { stiffness: 300, mass: 1, dampingRatio: 1 }

const PARTICLE_COUNT = 16
/** A particle loses speed at this rate per second, so a particle with speed v stops after about v / drag view units. */
const PARTICLE_DRAG = 3.2

interface Particle {
  angle: number
  distance: number
  speed: number
  age: number
  life: number
  radius: number
}

const reducedMotion = usePreferredReducedMotion()
const calm = computed(() => reducedMotion.value === 'reduce')
const noise = createSimplexNoise3D(20260512)

function targetSize() {
  switch (props.stage) {
    case 'recording': return SIZE_IDLE + (SIZE_FULL - SIZE_IDLE) * Math.min(1, Math.max(0, props.progress))
    case 'full': return SIZE_FULL
    case 'saved': return SIZE_SAVED
    default: return SIZE_IDLE
  }
}

// The circles start at their size and color, so a page that shows a saved voiceprint does not animate it again.
const size = { position: targetSize(), velocity: 0 }
const flash = { position: 0, velocity: 0 }
const dim = { position: props.dimmed ? 1 : 0, velocity: 0 }
let particles: Particle[] = []
let clock = 0

const radius = shallowRef(size.position)
const flashLevel = shallowRef(0)
const dimLevel = shallowRef(dim.position)
const time = shallowRef(0)
const drawnParticles = shallowRef<readonly { x: number, y: number, radius: number }[]>([])

watch(() => props.stage, (stage, previous) => {
  if (stage !== 'full' || previous !== 'recording' || calm.value)
    return
  flash.position = 1
  flash.velocity = 0
  particles = Array.from({ length: PARTICLE_COUNT }, (_, index) => ({
    angle: (index / PARTICLE_COUNT) * Math.PI * 2 + ((index * 7) % 5 - 2) * 0.08,
    distance: radius.value * 0.92,
    speed: index % 2 === 0 ? 150 - (index % 3) * 13 : 97 + (index % 4) * 10,
    age: 0,
    life: 0.7 + (index % 4) * 0.08,
    radius: 2.2 + (index % 3) * 0.9,
  }))
})

const { heights } = useVoiceWaveLayers(() => props.bands, () => props.stage === 'recording', (frameSeconds, stepCount) => {
  const stepSeconds = frameSeconds / stepCount
  const target = targetSize()
  // A cluster that comes back from the saved size pops in. A cluster that leaves the full size shrinks with a swing.
  const sizeSpring = size.position < SIZE_IDLE * 0.95 && target >= SIZE_IDLE
    ? APPEAR_SPRING
    : target < size.position - 1 ? SHRINK_SPRING : GROW_SPRING
  for (let step = 0; step < stepCount; step++) {
    Object.assign(size, stepSpring(sizeSpring, size.position, size.velocity, target, stepSeconds))
    Object.assign(flash, stepSpring(FLASH_SPRING, flash.position, flash.velocity, 0, stepSeconds))
    Object.assign(dim, stepSpring(FADE_SPRING, dim.position, dim.velocity, props.dimmed ? 1 : 0, stepSeconds))
  }
  clock += frameSeconds
  radius.value = Math.max(0, size.position)
  flashLevel.value = Math.max(0, flash.position)
  dimLevel.value = Math.min(1, Math.max(0, dim.position))
  time.value = clock

  if (particles.length === 0 && drawnParticles.value.length === 0)
    return
  // Drag in closed form: the speed falls by e^(-drag × t), and the distance grows by the integral of the speed.
  const decay = Math.exp(-PARTICLE_DRAG * frameSeconds)
  particles = particles.filter((particle) => {
    particle.distance += particle.speed * (1 - decay) / PARTICLE_DRAG
    particle.speed *= decay
    particle.age += frameSeconds
    return particle.age < particle.life
  })
  drawnParticles.value = particles.map((particle) => {
    const life = particle.age / particle.life
    return {
      x: CENTER + Math.cos(particle.angle) * particle.distance,
      y: CENTER + Math.sin(particle.angle) * particle.distance,
      radius: particle.radius * (1 - life * life),
    }
  })
})

/** A smooth closed path through the points: a Catmull-Rom spline, written as cubic Bézier segments. */
function closedCurve(points: readonly (readonly [number, number])[]) {
  const count = points.length
  const format = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`
  let path = `M${format(...points[0])}`
  for (let index = 0; index < count; index++) {
    const [x0, y0] = points[(index - 1 + count) % count]
    const [x1, y1] = points[index]
    const [x2, y2] = points[(index + 1) % count]
    const [x3, y3] = points[(index + 2) % count]
    path += `C${format(x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6)} ${format(x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6)} ${format(x2, y2)}`
  }
  return `${path}Z`
}

/**
 * The outline of one circle. Each angle reads simplex noise on a circle in the noise field, and the field moves in
 * time. So every part of the outline moves on its own, and the wobble is even around the circle. The usual way to
 * animate an organic blob works the same way (George Francis, "Build a smooth, animated blob using SVG + JS").
 */
function outline(index: number, voiceLevel: number) {
  const circle = CIRCLES[index]
  const r = radius.value
  const noiseRadius = Math.min(NOISE_RADIUS_MAX, Math.max(NOISE_RADIUS_MIN, r / circle.wavelength))
  // The amplitude grows with the circle: the full amount at the full size, and less at the saved size.
  const growth = SMALL_AMPLITUDE_SCALE + (1 - SMALL_AMPLITUDE_SCALE) * Math.min(1, Math.max(0, (r - SIZE_SAVED) / (SIZE_FULL - SIZE_SAVED)))
  const rest = calm.value ? 0 : REST_AMPLITUDE
  const amplitude = (rest + VOICE_AMPLITUDE * circle.reach * voiceLevel) * growth
  const z = time.value * circle.speed + index * 17.3
  const offset = index * 11.7
  const points: [number, number][] = []
  for (let point = 0; point < POINTS; point++) {
    const theta = (point / POINTS) * Math.PI * 2
    const value = noise(Math.cos(theta) * noiseRadius + offset, Math.sin(theta) * noiseRadius - offset, z)
    const length = r * (1 + NOISE_GAIN * amplitude * value)
    points.push([CENTER + Math.cos(theta) * length, CENTER + Math.sin(theta) * length])
  }
  return closedCurve(points)
}

/**
 * The top of the `below` slot, as a part of the visual height. It stays clear of the resting wobble, follows the
 * circles as they grow and shrink, and keeps a gap of 8 view units.
 */
const belowTop = computed(() => `${(CENTER + radius.value * (1 + NOISE_GAIN * REST_AMPLITUDE) + 8) / VIEW_SIZE * 100}%`)

/** Primary shades from the microphone page once a recording starts. Before that, gray like the resting waves. */
const shapes = computed(() => CIRCLES.map((circle, index) => {
  const layer = VOICE_WAVE_LAYERS[index]
  const level = props.stage === 'recording' ? Math.min(1, Math.max(0, heights.value[index] / layer.maxHeight)) : 0
  return {
    d: radius.value > 0.5 ? outline(index, level) : '',
    color: props.stage === 'idle' ? 'text-neutral-400 dark:text-neutral-600' : layer.color,
    opacity: circle.opacity * (1 + 0.6 * flashLevel.value) * (1 - 0.5 * dimLevel.value),
  }
}))
</script>

<template>
  <div :class="['pointer-events-none relative aspect-square']">
    <!--
      The caller sets the width, and the visual is square. The particles fly past the edge of the drawing, so the
      drawing does not clip them. The drawing takes no pointer events: controls can sit over its empty area.
    -->
    <svg role="img" :aria-label="label" :viewBox="`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`" :class="['absolute inset-0 h-full w-full overflow-visible']">
      <path
        v-for="(shape, index) in shapes"
        :key="index"
        :d="shape.d"
        :class="[shape.color, 'transition-colors duration-500']"
        fill="currentColor"
        :fill-opacity="shape.opacity"
      />
      <!-- The light of a full recording: a white sheet in the shape of the lowest band. -->
      <path
        v-if="flashLevel > 0.01 && shapes[0].d"
        :d="shapes[0].d"
        fill="white"
        :fill-opacity="0.35 * flashLevel"
      />
      <!-- A particle stacks the four colors with their opacities, so it has the color where the four circles overlap. -->
      <g v-for="(particle, index) in drawnParticles" :key="index" data-testid="voiceprint-particle">
        <circle
          v-for="(circle, layerIndex) in CIRCLES"
          :key="layerIndex"
          :cx="particle.x"
          :cy="particle.y"
          :r="particle.radius"
          :class="[VOICE_WAVE_LAYERS[layerIndex].color]"
          fill="currentColor"
          :fill-opacity="circle.opacity"
        />
      </g>
    </svg>
    <div v-if="$slots.below" :class="['absolute left-1/2 max-w-80 w-max flex flex-col items-center text-center -translate-x-1/2']" :style="{ top: belowTop }">
      <slot name="below" />
    </div>
  </div>
</template>
