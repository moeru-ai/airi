<script setup lang="ts">
import type { StageTransitionCommonParams } from '.'

import { useCssVariables } from './useCssVar'

const {
  primaryColor = '#666',
  secondaryColor = '#ccc',
  zIndex = 100,
} = defineProps<Omit<StageTransitionCommonParams, 'name'>>()

useCssVariables(() => ({
  'overlay-color-1': primaryColor,
  'overlay-color-2': secondaryColor,
}), { prefix: '--stage-transition-3-' })
</script>

<template>
  <div class="stage-transition-3" :style="{ zIndex }" />
</template>

<style scoped>
/**
 * Author: yui540
 * Source code at: https://github.com/yui540/css-animations/blob/643e374e508de112202862a7b65236621cf8a7cc/2025-02-25/transitions/index.html#L160-L233
 */

.stage-transition-3 {
  --delay: 0s;
  --sharpness: 40%;

  position: fixed;
  inset: 0;
  overflow: hidden;

  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    animation:
      arrowIn 1s cubic-bezier(0.87, 0.05, 0.02, 0.97) both,
      arrowOut 1s cubic-bezier(0.87, 0.05, 0.02, 0.97) forwards;
  }

  &::before {
    background-color: var(--stage-transition-3-overlay-color-2);
    animation-delay: calc(0s + var(--delay, 0s)), calc(1.4s + var(--delay, 0s));
  }

  &::after {
    background-color: var(--stage-transition-3-overlay-color-1);
    animation-delay: calc(0.2s + var(--delay, 0s)), calc(1.2s + var(--delay, 0s));
  }
}

@keyframes arrowIn {
  from {
    clip-path: polygon(
      calc(var(--sharpness) * -1) 0,
      calc(var(--sharpness) * -1) 0,
      0 50%,
      calc(var(--sharpness) * -1) 100%,
      calc(var(--sharpness) * -1) 100%,
      0 50%
    );
  }

  to {
    clip-path: polygon(
      calc(var(--sharpness) * -1) 0,
      100% 0,
      calc(100% + var(--sharpness)) 50%,
      100% 100%,
      calc(var(--sharpness) * -1) 100%,
      0 50%
    );
  }
}

@keyframes arrowOut {
  from {
    clip-path: polygon(
      calc(var(--sharpness) * -1) 0,
      100% 0,
      calc(100% + var(--sharpness)) 50%,
      100% 100%,
      calc(var(--sharpness) * -1) 100%,
      0 50%
    );
  }

  to {
    clip-path: polygon(
      100% 0,
      100% 0,
      calc(100% + var(--sharpness)) 50%,
      100% 100%,
      100% 100%,
      calc(100% + var(--sharpness)) 50%
    );
  }
}
</style>
