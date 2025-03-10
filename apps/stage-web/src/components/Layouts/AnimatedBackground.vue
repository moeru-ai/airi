<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface WaveProps {
  verticalOffset?: number // Vertical offset of the wave in pixels
  height?: number // Height of the wave in pixels
  amplitude?: number // Wave height variation in pixels
  waveLength?: number // Length of one wave cycle in pixels
  fillColor?: string // Fill color of the wave
  direction?: 'up' | 'down'// Direction of the wave: 'up' or 'down'
  animationSpeed?: number // Speed of the wave animation in pixels per second
}

// Use either provided wave props or defaults
const props = withDefaults(defineProps<WaveProps>(), {
  verticalOffset: 20,
  height: 40,
  amplitude: 14,
  waveLength: 250,
  fillColor: 'oklch(95% 0.10 var(--theme-colors-hue))',
  direction: 'down',
  animationSpeed: 50,
})

// Reactive Variables
const waveHeight = ref(props.height)
const waveAmplitude = ref(props.amplitude)
const waveLength = ref(props.waveLength)
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
    const deltaY = amplitude * Math.sin((2 * Math.PI * x) / waveLength)
    const y = direction === 'up' ? baseY - deltaY : baseY + deltaY
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

// Using `mask-image` rather than `background-image` here as we cannot directly control SVG's fill color
const maskImage = computed(() => {
  const svg = `<svg width="${waveLength.value}" height="${waveAmplitude.value * 2}" xmlns="http://www.w3.org/2000/svg">
    <path d="${generateSineWavePath(waveLength.value, waveHeight.value, waveAmplitude.value, waveLength.value, direction.value)}"/>
  </svg>`
  return `url(data:image/svg+xml;base64,${btoa(svg)})`
})

watch(
  () => [props.height, props.amplitude, props.waveLength, props.fillColor, props.direction],
  () => {
    waveHeight.value = props.height!
    waveAmplitude.value = props.amplitude!
    waveLength.value = props.waveLength!
    waveFillColor.value = props.fillColor!
    direction.value = props.direction!
  },
  { immediate: true },
)
</script>

<template>
  <div class="relative">
    <slot />
    <div absolute left-0 right-0 top-0 w-full overflow-hidden>
      <div v-if="direction === 'down'" :style="{ backgroundColor: waveFillColor, height: `${waveHeight}px` }" w-full />
      <div
        class="wave"
        :style="{
          'background': waveFillColor,
          'height': `${waveAmplitude * 2}px`,
          maskImage,
          'WebkitMaskImage': maskImage,
          '--wave-translate': `${-waveLength}px`,
          '--animation-duration': `${waveLength / animationSpeed}s`,
        }"
      />
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
  width: 200vw;
  mask-repeat: repeat-x;
  -webkit-mask-repeat: repeat-x;
  will-change: transform;
  animation: wave-animation var(--animation-duration, 5s) linear infinite;
}
</style>
