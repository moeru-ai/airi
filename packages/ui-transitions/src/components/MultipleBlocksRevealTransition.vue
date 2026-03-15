<script setup lang="ts">
import { computed, onMounted } from 'vue'

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

onMounted(() => {
  document.documentElement.style.setProperty('--stage-transition-4-overlay-color-1', overlayColor1.value)
  document.documentElement.style.setProperty('--stage-transition-4-overlay-color-2', overlayColor2.value)
})
</script>

<template>
  <div class="stage-transition-4" :style="{ zIndex: stageTransition?.zIndex ?? 100 }">
    <div class="stage-transition-4__block" />
    <div class="stage-transition-4__block" />
    <div class="stage-transition-4__block" />
    <div class="stage-transition-4__block" />
    <div class="stage-transition-4__block" />
  </div>
</template>

<style scoped>
/**
 * Author: yui540
 * Source code at: https://github.com/yui540/css-animations/blob/643e374e508de112202862a7b65236621cf8a7cc/2025-02-25/transitions/index.html#L235-L284
 */

.stage-transition-4 {
  --delay: 0s;

  position: fixed;
  inset: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: repeat(5, 1fr);
}

.stage-transition-4__block {
  position: relative;
  width: 100%;
  height: 100%;

  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    animation:
      slideIn 0.8s cubic-bezier(0.87, 0.05, 0.02, 0.97) both,
      slideOut 0.8s cubic-bezier(0.87, 0.05, 0.02, 0.97) forwards;
  }

  &::before {
    background-color: var(--stage-transition-4-overlay-color-2);
    animation-delay: calc(0s + var(--d, 0s) + var(--delay, 0s)), calc(1.6s + var(--d, 0s) + var(--delay, 0s));
  }

  &::after {
    background-color: var(--stage-transition-4-overlay-color-1);
    animation-delay: calc(0.3s + var(--d, 0s) + var(--delay, 0s)), calc(1.3s + var(--d, 0s) + var(--delay, 0s));
  }

  &:nth-child(1) {
    --d: 0.1s;
  }

  &:nth-child(2) {
    --d: 0.3s;
  }

  &:nth-child(3) {
    --d: 0s;
  }

  &:nth-child(4) {
    --d: 0.4s;
  }

  &:nth-child(5) {
    --d: 0.2s;
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
