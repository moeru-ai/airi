<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'

const props = defineProps<{
  stageTransition?: {
    primaryColor?: string
    secondaryColor?: string
    zIndex?: number
  }
}>()

const stageTransition = computed(() => props.stageTransition)
const overlayColor1 = computed(() => stageTransition.value?.primaryColor || '#666')
const overlayColor2 = computed(() => stageTransition.value?.secondaryColor || '#ccc')

watch([stageTransition, overlayColor1, overlayColor2], () => {
  document.documentElement.style.setProperty('--stage-transition-1-overlay-color-1', overlayColor1.value)
  document.documentElement.style.setProperty('--stage-transition-1-overlay-color-2', overlayColor2.value)
})

onMounted(() => {
  document.documentElement.style.setProperty('--stage-transition-1-overlay-color-1', overlayColor1.value)
  document.documentElement.style.setProperty('--stage-transition-1-overlay-color-2', overlayColor2.value)
})
</script>

<template>
  <div class="stage-transition-1" :style="{ zIndex: stageTransition?.zIndex ?? 100 }" />
</template>

<style scoped>
/**
 * Author: yui540
 * Source code at: https://github.com/yui540/css-animations/blob/643e374e508de112202862a7b65236621cf8a7cc/2025-02-25/transitions/index.html#L48-L91
 */

.stage-transition-1 {
  --delay: 0s;

  position: fixed;
  inset: 0;
  overflow: hidden;

  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    animation:
      slideIn 1s cubic-bezier(0.87, 0.05, 0.02, 0.97) both,
      slideOut 1s cubic-bezier(0.87, 0.05, 0.02, 0.97) forwards;
  }

  &::before {
    background-color: var(--stage-transition-1-overlay-color-2);
    animation-delay: calc(0s + var(--delay, 0s)), calc(1.4s + var(--delay, 0s));
  }

  &::after {
    background-color: var(--stage-transition-1-overlay-color-1);
    animation-delay: calc(0.2s + var(--delay, 0s)), calc(1.2s + var(--delay, 0s));
  }
}

@keyframes slideIn {
  from {
    transform: translateX(-101%);
  }

  to {
    transform: translateX(0);
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(101%);
  }
}
</style>
