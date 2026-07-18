<script setup lang="ts">
defineProps<{
  enterDelay?: number
}>()
</script>

<template>
  <div
    v-motion
    :initial="{ opacity: 0, y: 16 }"
    :enter="{ opacity: 1, y: 0, transition: { delay: enterDelay } }"
    :class="[
      'h-full w-full of-auto rounded-2xl px-3 py-3 backdrop-blur-lg',
      'transition-all duration-300 ease-in-out',
    ]"
  >
    <slot />
  </div>
</template>
