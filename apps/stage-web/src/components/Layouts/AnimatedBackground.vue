<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { onMounted, ref, watch } from 'vue'

interface WaveProps {
  verticalOffset?: number // Vertical offset of the wave in pixels
  height?: number // Height of the wave in pixels
  amplitude?: number // Wave height variation in pixels
  waveLength?: number // Length of one wave cycle in pixels
  fillColor?: string // Fill color of the wave
  direction?: 'up' | 'down'// Direction of the wave: 'up' or 'down'
  animationSpeed?: number // Speed of the wave animation in pixels per second
}

const props = withDefaults(defineProps<WaveProps>(), {
  verticalOffset: 20,
  height: 40,
  amplitude: 14,
  waveLength: 250,
  fillColor: 'oklch(95% 0.10 var(--theme-colors-hue))',
  direction: 'down',
  animationSpeed: 50,
})

// Use either provided waves or defaults

// Refs
const container = ref<HTMLElement | null>(null)
const svg = ref<SVGSVGElement | null>(null)

// Reactive Variables
const svgWidth = ref(0)
const waveHeight = ref(props.height)
const waveAmplitude = ref(props.amplitude)
const waveLength = ref(props.waveLength)
const wavePath = ref('')
const waveFillColor = ref(props.fillColor)
const direction = ref<'up' | 'down'>(props.direction)

// Function to generate the SVG sine wave path
function generateSineWavePath(
  width: number,
  height: number,
  amplitude: number,
  waveLength: number,
  direction: 'up' | 'down',
): string {
  const points: string[] = []

  // Calculate the number of complete waves to fill the SVG width
  const numberOfWaves = Math.ceil(width / waveLength)

  // Total width covered by all complete waves
  const totalWavesWidth = numberOfWaves * waveLength

  // Step size in pixels for generating points (1px for precision)
  const step = 1

  // Determine base Y position based on direction
  const baseY = direction === 'up' ? height - amplitude : amplitude

  // Start the path at the base Y position
  points.push(`M 0 ${baseY}`)

  // Generate points for the sine wave
  for (let x = 0; x <= totalWavesWidth; x += step) {
    const y = direction === 'up'
      ? baseY - amplitude * Math.sin((2 * Math.PI * x) / waveLength)
      : baseY + amplitude * Math.sin((2 * Math.PI * x) / waveLength)
    points.push(`L ${x} ${y}`)
  }

  // Close the path for filling
  if (direction === 'up') {
    points.push(`L ${totalWavesWidth} ${height}`)
    points.push(`L 0 ${height} Z`)
  }
  else {
    points.push(`L ${totalWavesWidth} 0`)
    points.push(`L 0 0 Z`)
  }

  return points.join(' ')
}

// Function to handle container resize
function handleResize() {
  if (container.value) {
    const width = container.value.clientWidth
    svgWidth.value = width

    // Calculate the number of waves needed to cover twice the container width
    const numberOfWaves = Math.ceil((width * 2) / waveLength.value)

    // Total width is exact multiple of waveLength
    const totalWavesWidth = numberOfWaves * waveLength.value

    // Generate wave path based on the exact total width
    wavePath.value = generateSineWavePath(
      totalWavesWidth,
      waveHeight.value,
      waveAmplitude.value,
      waveLength.value,
      direction.value,
    )

    // Update SVG width to match the exact multiple
    svg.value?.setAttribute('width', totalWavesWidth.toString())
  }
}

watch(
  () => [props.height, props.amplitude, props.waveLength, props.fillColor, props.direction],
  () => {
    waveHeight.value = props.height!
    waveAmplitude.value = props.amplitude!
    waveLength.value = props.waveLength!
    waveFillColor.value = props.fillColor!
    direction.value = props.direction!
    handleResize() // Regenerate wave path on prop changes
  },
  { immediate: true },
)

useEventListener('resize', handleResize)

// Setup on mount
onMounted(() => {
  handleResize() // Initial wave generation
})
</script>

<template>
  <div class="relative">
    <slot />
    <div ref="container" absolute left-0 right-0 top-0 w-full overflow-hidden>
      <div v-if="direction === 'down'" :style="{ backgroundColor: waveFillColor, height: `${waveHeight}px` }" w-full />
      <svg
        ref="svg"
        :width="waveLength * Math.ceil((svgWidth * 2) / waveLength)"
        :height="waveHeight"
        :viewBox="`0 0 ${waveLength * Math.ceil((svgWidth * 2) / waveLength)} ${waveHeight}`"
        xmlns="http://www.w3.org/2000/svg"
        h="[100%]" w="auto"
        :style="{
          'willChange': 'transform',
          '--wave-translate': `${-waveLength}px`,
          '--animation-duration': `${waveLength / animationSpeed}s`,
        }"
        class="wave"
      >
        <path :d="wavePath" :fill="waveFillColor" />
      </svg>
      <div v-if="direction === 'up'" :style="{ backgroundColor: waveFillColor, height: `${waveHeight}px` }" w-full />
    </div>
  </div>
</template>

<style scoped>
@keyframes wave-animation {
  from {
    transform: translate(0);
  }
  to {
    transform: translate(var(--wave-translate, -250px));
  }
}

.wave {
  animation: wave-animation var(--animation-duration, 5s) linear infinite;
}
</style>
