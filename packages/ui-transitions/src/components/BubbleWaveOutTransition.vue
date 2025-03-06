<script setup lang="ts">
import { onMounted } from 'vue'

const props = withDefaults(defineProps<{
  colors?: string[]
  delay?: number
  duration?: number
}>(), {
  colors: () => ['#eee', '#ebcb8b', '#c56370', '#3f3b52'],
  delay: 0,
  duration: 0.4,
})

onMounted(() => {
  document.documentElement.style.setProperty('--circle-expansion-delay', `${props.delay}s`)
  document.documentElement.style.setProperty('--circle-expansion-duration', `${props.duration}s`)
  props.colors.forEach((color, index) => {
    document.documentElement.style.setProperty(`--circle-expansion-color-${index + 1}`, color)
  })
})
</script>

<template>
  <div class="circle-expansion-transition">
    <div v-for="(_, index) in props.colors" :key="index" />
  </div>
</template>

<style scoped>
.circle-expansion-transition {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transform: translate(-50%, -50%);
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
