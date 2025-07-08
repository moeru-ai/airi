<script setup lang="ts">
const props = withDefaults(defineProps<{
  animation?: 'pulse' | 'wave' | 'none'
}>(), {
  animation: 'pulse',
})
</script>

<template>
  <div
    class="skeleton"
    :class="props.animation !== 'none' ? `skeleton-${props.animation}` : ''"
    bg="neutral-200 dark:neutral-800"
    overflow="hidden"
  >
    <slot />
  </div>
</template>

<style scoped>
.skeleton {
  position: relative;
  transition: all 0.2s ease-in-out;
}

/* Pulse animation */
.skeleton-pulse {
  animation: skeleton-pulse 2s ease-in-out 0.5s infinite;
}

@keyframes skeleton-pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

/* Wave animation */
.skeleton-wave::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgb(255, 255, 255), transparent);
  animation: skeleton-wave 2s ease-in-out infinite;
  border-radius: inherit;
}

.dark .skeleton-wave::after {
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
}

@keyframes skeleton-wave {
  0% {
    transform: translateX(-100%);
    opacity: 0;
  }
  60% {
    transform: translateX(100%);
    opacity: 1;
  }
  100% {
    transform: translateX(100%);
    opacity: 0;
  }
}
</style>
