<script setup lang="ts">
import { computed, onMounted } from 'vue'

const props = defineProps<{
  stageTransition?: {
    colors?: string[]
    delay?: number
    duration?: number
    zIndex?: number
  }
}>()

const colors = computed(() => props.stageTransition?.colors || ['#eee', '#ebcb8b', '#c56370', '#3f3b52'])

onMounted(() => {
  document.documentElement.style.setProperty('--circle-expansion-delay', `${props.stageTransition?.delay || 0}s`)
  document.documentElement.style.setProperty('--circle-expansion-duration', `${props.stageTransition?.duration || 0.4}s`)
  colors.value.forEach((color, index) => {
    document.documentElement.style.setProperty(`--circle-expansion-color-${index + 1}`, color)
  })
})
</script>

<template>
  <div class="circle-expansion-transition" :style="{ zIndex: stageTransition?.zIndex || 100 }">
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
