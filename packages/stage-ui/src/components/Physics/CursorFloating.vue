<script setup lang="ts">
// https://codepen.io/simeydotme/pen/PrQKgo

import { onMounted, ref } from 'vue'

interface Props {
  intensity?: number
}

const props = withDefaults(defineProps<Props>(), {
  intensity: 1.5,
})

const cardRef = ref<HTMLElement | null>(null)
const transformStyle = ref('')
const gradientPosition = ref('50% 50%')
const sparklePosition = ref('50% 50%')
const sparkleOpacity = ref(0.5)

function handleMouseMove(event: MouseEvent) {
  if (!cardRef.value)
    return

  const card = cardRef.value
  const rect = card.getBoundingClientRect()

  // Calculate mouse position relative to card
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  const cardWidth = card.offsetWidth
  const cardHeight = card.offsetHeight

  // Calculate percentages and effect values
  const xPercent = Math.abs(Math.floor(100 / cardWidth * x) - 100)
  const yPercent = Math.abs(Math.floor(100 / cardHeight * y) - 100)

  // Calculate positions for gradient and sparkle effects
  const leftPos = (50 + (xPercent - 50) / 1.5)
  const topPos = (50 + (yPercent - 50) / 1.5)
  const sparkleX = (50 + (xPercent - 50) / 7)
  const sparkleY = (50 + (yPercent - 50) / 7)

  // Calculate 3D rotation angles - intensity controlled by prop
  const rotateY = ((leftPos - 50) / 1.5) * 0.2 * props.intensity
  const rotateX = ((topPos - 50) / 2) * -1 * 0.2 * props.intensity

  // Calculate sparkle opacity with intensity control
  const pAngle = (50 - xPercent) + (50 - yPercent)
  const opacity = 0.5 + (Math.abs(pAngle) * 0.008 * props.intensity)

  // Update style values
  transformStyle.value = `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${1 + 0.015 * props.intensity}, ${1 + 0.015 * props.intensity}, ${1 + 0.015 * props.intensity})`
  gradientPosition.value = `${leftPos}% ${topPos}%`
  sparklePosition.value = `${sparkleX}% ${sparkleY}%`
  sparkleOpacity.value = opacity
}

function resetCard() {
  transformStyle.value = 'perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
  gradientPosition.value = '50% 50%'
  sparklePosition.value = '50% 50%'
  sparkleOpacity.value = 0.5
}

onMounted(() => {
  // Initialize with default transform to ensure smooth transitions
  transformStyle.value = 'perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)'
})
</script>

<template>
  <div
    ref="cardRef"
    class="card-hover-effect"
    :style="{
      'transform': transformStyle,
      '--effect-intensity': intensity,
    }"
    @mousemove="handleMouseMove"
    @mouseleave="resetCard"
  >
    <slot />
  </div>
</template>

<style scoped>
.card-hover-effect {
  transform-style: preserve-3d;
  transform-origin: center;
  will-change: transform;
  transition: transform 0.3s cubic-bezier(0.23, 1, 0.32, 1);
}

.card-hover-effect::before,
.card-hover-effect::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  top: 0;
  background-repeat: no-repeat;
  transition: all 0.33s ease;
  pointer-events: none;
}

.card-hover-effect::before {
  background-position: var(--card-position-x) var(--card-position-y);
  background-size: 300% 300%;
  background-image: linear-gradient(
    115deg,
    transparent 0%,
    rgba(var(--color-primary-500), calc(0.3 * var(--effect-intensity))) 25%,
    transparent 47%,
    transparent 53%,
    rgba(var(--color-primary-600), calc(0.3 * var(--effect-intensity))) 75%,
    transparent 100%
  );
  opacity: calc(0.5 * var(--effect-intensity));
  filter: brightness(0.5) contrast(1);
  z-index: 1;
  mix-blend-mode: color-dodge;
}

.card-hover-effect::after {
  background-position: var(--sparkle-position-x) var(--sparkle-position-y);
  background-size: 160%;
  background-image: linear-gradient(
    125deg,
    rgba(var(--color-primary-500), calc(0.3 * var(--effect-intensity))) 15%,
    rgba(var(--color-primary-400), calc(0.25 * var(--effect-intensity))) 30%,
    rgba(var(--color-primary-300), calc(0.2 * var(--effect-intensity))) 40%,
    rgba(var(--color-primary-200), calc(0.1 * var(--effect-intensity))) 60%,
    rgba(var(--color-primary-400), calc(0.25 * var(--effect-intensity))) 70%,
    rgba(var(--color-primary-500), calc(0.3 * var(--effect-intensity))) 85%
  );
  background-blend-mode: overlay;
  opacity: calc(var(--sparkle-opacity) * var(--effect-intensity));
  filter: brightness(1) contrast(1);
  z-index: 2;
  mix-blend-mode: color-dodge;
}

.card-hover-effect:hover::before {
  opacity: calc(0.88 * var(--effect-intensity));
  filter: brightness(0.66) contrast(1.33);
}

.card-hover-effect:hover::after {
  opacity: var(--effect-intensity);
  filter: brightness(1.1) contrast(1.2);
}
</style>
