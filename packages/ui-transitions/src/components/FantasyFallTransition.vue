<script setup lang="ts">
import { onMounted } from 'vue'

const props = withDefaults(defineProps<{
  primaryColor?: string
  duration?: number
  delay?: number
  borderRadius?: number
}>(), {
  primaryColor: '#eee',
  duration: 0.6,
  delay: 0,
  borderRadius: 50,
})

onMounted(() => {
  document.documentElement.style.setProperty('--fantasy-fall-color', props.primaryColor)
  document.documentElement.style.setProperty('--fantasy-fall-duration', `${props.duration}s`)
  document.documentElement.style.setProperty('--fantasy-fall-delay', `${props.delay}s`)
  document.documentElement.style.setProperty('--fantasy-fall-radius', `${props.borderRadius}%`)
})
</script>

<template>
  <div class="fantasy-fall-transition" />
</template>

<style scoped>
.fantasy-fall-transition {
  position: absolute;
  inset: 0;
  overflow: hidden;

  &::before {
    content: '';
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: var(--fantasy-fall-color);
    transform: translateY(-100%);
    border-bottom-left-radius: var(--fantasy-fall-radius);
    border-bottom-right-radius: var(--fantasy-fall-radius);
    animation: fantasy-fall var(--fantasy-fall-duration) ease-out var(--fantasy-fall-delay) forwards;
  }
}

@keyframes fantasy-fall {
  0% {
    transform: translateY(-100%);
  }

  50% {
    transform: translateY(0%);
  }

  100% {
    transform: translateY(0%);
    border-bottom-right-radius: 0%;
    border-bottom-left-radius: 0%;
  }
}
</style>
