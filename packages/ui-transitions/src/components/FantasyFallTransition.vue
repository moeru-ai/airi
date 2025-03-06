<script setup lang="ts">
import { onMounted } from 'vue'

const props = defineProps <{
  stageTransition?: {
    primaryColor?: string
    duration?: number
    delay?: number
    borderRadius?: {
      sm?: string
      md?: string
      lg?: string
    }
  }
}> ()

onMounted(() => {
  document.documentElement.style.setProperty('--fantasy-fall-color', props.stageTransition.primaryColor || '#eee')
  document.documentElement.style.setProperty('--fantasy-fall-duration', `${props.stageTransition.duration || 0.6}s`)
  document.documentElement.style.setProperty('--fantasy-fall-delay', `${props.stageTransition.delay || 0}s`)
  document.documentElement.style.setProperty('--fantasy-fall-radius-sm', `${props.stageTransition.borderRadius?.sm || '14rem'}`)
  document.documentElement.style.setProperty('--fantasy-fall-radius-md', `${props.stageTransition.borderRadius?.md || '14rem'}`)
  document.documentElement.style.setProperty('--fantasy-fall-radius-lg', `${props.stageTransition.borderRadius?.lg || '50%'}`)
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
    border-bottom-left-radius: var(--fantasy-fall-radius-sm);
    border-bottom-right-radius: var(--fantasy-fall-radius-sm);
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

@media (min-width: 768px) {
  .fantasy-fall-transition {
    &::before {
      border-bottom-left-radius: var(--fantasy-fall-radius-md);
      border-bottom-right-radius: var(--fantasy-fall-radius-md);
    }
  }
}

@media (min-width: 1024px) {
  .fantasy-fall-transition {
    &::before {
      border-bottom-left-radius: var(--fantasy-fall-radius-lg);
      border-bottom-right-radius: var(--fantasy-fall-radius-lg);
    }
  }
}
</style>
