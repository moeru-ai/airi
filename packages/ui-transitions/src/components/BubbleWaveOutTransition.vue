<script setup lang="ts">
import { useCssVariables } from './useCssVar'

interface TransitionParams {
  colors?: string[]
  delay?: number
  duration?: number
  zIndex?: number
}

const {
  colors = ['#eee', '#ebcb8b', '#c56370', '#3f3b52'],
  delay = 0,
  duration = 0.4,
  zIndex = 100,
} = defineProps<TransitionParams>()

function getCssVar() {
  const record: Record<string, string> = {
    delay: `${delay}s`,
    duration: `${duration}s`,
  }
  colors.forEach((color, index) => {
    record[`color-${index + 1}`] = color
  })
  return record
}

useCssVariables(getCssVar, { prefix: '--circle-expansion-' })
</script>

<template>
  <div class="circle-expansion-transition" :style="{ zIndex }">
    <div v-for="(_, index) in colors" :key="index" />
  </div>
</template>

<style scoped>
.circle-expansion-transition {
  position: fixed;
  top: calc(50% - 75vmax);
  left: calc(50% - 75vmax);
  width: 150vmax;
  height: 150vmax;
  pointer-events: none;
}

.circle-expansion-transition div {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  transform: scale(0);
}

.circle-expansion-transition div:nth-child(1) {
  background-color: var(--circle-expansion-color-1);
  animation: circleExpand var(--circle-expansion-duration) ease-in calc(var(--circle-expansion-delay) + 0s) forwards;
}

.circle-expansion-transition div:nth-child(2) {
  background-color: var(--circle-expansion-color-2);
  animation: circleExpand var(--circle-expansion-duration) ease-in calc(var(--circle-expansion-delay) + 0.15s) forwards;
}

.circle-expansion-transition div:nth-child(3) {
  background-color: var(--circle-expansion-color-3);
  animation: circleExpand var(--circle-expansion-duration) ease-in calc(var(--circle-expansion-delay) + 0.3s) forwards;
}

.circle-expansion-transition div:nth-child(4) {
  background-color: var(--circle-expansion-color-4);
  animation: circleExpand var(--circle-expansion-duration) ease-in calc(var(--circle-expansion-delay) + 0.45s) forwards;
}

@keyframes circleExpand {
  from {
    transform: scale(0);
  }
  to {
    transform: scale(1);
  }
}
</style>
