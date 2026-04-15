<script setup lang="ts">
import type { StageTransitionCommonParams } from '.'

import { onMounted } from 'vue'

const { primaryColor = '#666', secondaryColor = '#ccc', zIndex = 100 }
  = defineProps<Omit<StageTransitionCommonParams, 'name'>>()

onMounted(() => {
  const setCssVar = (name: string, val: string) => document.documentElement.style.setProperty(name, val)
  setCssVar('--stage-transition-1-overlay-color-1', primaryColor)
  setCssVar('--stage-transition-1-overlay-color-2', secondaryColor)
})
</script>

<template>
  <div class="stage-transition-1" :style="{ zIndex }" />
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
