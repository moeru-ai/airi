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
const overlayColor1 = computed(() => stageTransition.value?.primaryColor ?? '#666')
const overlayColor2 = computed(() => stageTransition.value?.secondaryColor ?? '#ccc')

onMounted(() => {
  document.documentElement.style.setProperty('--stage-transition-2-overlay-color-1', overlayColor1.value)
  document.documentElement.style.setProperty('--stage-transition-2-overlay-color-2', overlayColor2.value)
})
</script>

<template>
  <div class="stage-transition-2" :style="{ zIndex: stageTransition?.zIndex ?? 100 }" />
</template>

<style scoped>
/**
 * Author: yui540
 * Source code at: https://github.com/yui540/css-animations/blob/643e374e508de112202862a7b65236621cf8a7cc/2025-02-25/transitions/index.html#L93-L158
 */

.stage-transition-2 {
  --delay: 0s;
  --skew-x: 100%;

  position: fixed;
  inset: 0;
  overflow: hidden;

  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    animation:
      maskIn 1s cubic-bezier(0.87, 0.05, 0.02, 0.97) both,
      maskOut 1s cubic-bezier(0.87, 0.05, 0.02, 0.97) forwards;
  }

  &::before {
    background-color: var(--stage-transition-2-overlay-color-2);
    animation-delay: calc(0s + var(--delay, 0s)), calc(1.4s + var(--delay, 0s));
  }

  &::after {
    background-color: var(--stage-transition-2-overlay-color-1);
    animation-delay: calc(0.2s + var(--delay, 0s)), calc(1.2s + var(--delay, 0s));
  }
}

@keyframes maskIn {
  from {
    clip-path: polygon(0 0, 0 0, calc(var(--skew-x, 0) * -1) 100%, calc(var(--skew-x, 0) * -1) 100%);
  }

  to {
    clip-path: polygon(0 0, calc(100% + var(--skew-x, 0)) 0, 100% 100%, calc(var(--skew-x, 0) * -1) 100%);
  }
}

@keyframes maskOut {
  from {
    clip-path: polygon(0 0, calc(100% + var(--skew-x, 0)) 0, 100% 100%, calc(var(--skew-x, 0) * -1) 100%);
  }

  to {
    clip-path: polygon(calc(100% + var(--skew-x, 0)) 0, calc(100% + var(--skew-x, 0)) 0, 100% 100%, 100% 100%);
  }
}
</style>
