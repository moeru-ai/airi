<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

interface Props {
  petalCount?: number
  refreshInterval?: number
  baseColor?: string
}

interface Petal {
  id: number
  style: {
    left: string
    top: string
    width: string
    height: string
    animationDuration: string
    animationDelay: string
    transform: string
  }
}

const props = withDefaults(defineProps<Props>(), {
  petalCount: 20,
  refreshInterval: 30000,
  baseColor: '#FFB6C1',
})

const petals = ref<Petal[]>([])
let animationInterval: number | null = null

function createPetalStyle() {
  const size = 8 + Math.random() * 4
  return {
    left: `${Math.random() * 100}%`,
    top: `-${size}px`,
    width: `${size}px`,
    height: `${size}px`,
    animationDuration: `${5 + Math.random() * 5}s`,
    animationDelay: `${Math.random() * 5}s`,
    transform: `rotate(${Math.random() * 360}deg)`,
  }
}

function createPetals() {
  petals.value.length = 0
  for (let i = 0; i < props.petalCount; i++) {
    petals.value.push({
      id: Date.now() + i,
      style: createPetalStyle(),
    })
  }
}

onMounted(() => {
  createPetals()
  animationInterval = window.setInterval(createPetals, props.refreshInterval)
})

onBeforeUnmount(() => {
  if (animationInterval) {
    window.clearInterval(animationInterval)
  }
})
</script>

<template>
  <div class="sakura-container">
    <div class="sakura-bg" />
    <div class="pattern-overlay" />
    <div class="petals-container">
      <div
        v-for="petal in petals"
        :key="petal.id"
        class="sakura-petal"
        :style="petal.style"
      />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.sakura-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.sakura-bg {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}

.pattern-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5c1.4-1.4 3.8-1.4 5.2 0L45 14.8c1.4 1.4 1.4 3.8 0 5.2L35.2 30l9.8 9.8c1.4 1.4 1.4 3.8 0 5.2L35.2 55c-1.4 1.4-3.8 1.4-5.2 0L20.2 45c-1.4-1.4-1.4-3.8 0-5.2L30 30l-9.8-9.8c-1.4-1.4-1.4-3.8 0-5.2L30 5z' fill='%23FFB6C1' fill-opacity='0.1'/%3E%3C/svg%3E");
  opacity: 0.5;
  animation: patternFloat 20s linear infinite;
  pointer-events: none;
  z-index: 2;
}

.petals-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  pointer-events: none;
}

.sakura-petal {
  position: absolute;
  background: v-bind('props.baseColor');
  border-radius: 150% 0 150% 0;
  opacity: 0.6;
  pointer-events: none;
  filter: blur(1px);
  animation-name: fall, drift;
  animation-timing-function: linear, ease-in-out;
  animation-iteration-count: infinite;
}

@keyframes fall {
  0% {
    top: -10px;
    transform: translateX(0) rotate(0deg);
  }
  100% {
    top: 100vh;
    transform: translateX(100px) rotate(360deg);
  }
}

@keyframes drift {
  0% {
    transform: translateX(0) rotate(0deg);
  }
  50% {
    transform: translateX(50px) rotate(180deg);
  }
  100% {
    transform: translateX(0) rotate(360deg);
  }
}

@keyframes patternFloat {
  0% {
    background-position: 0 0;
  }
  100% {
    background-position: 60px 60px;
  }
}
</style>
