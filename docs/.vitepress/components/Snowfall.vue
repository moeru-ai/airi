<!--
Author:  hyperstown <64496017+hyperstown@users.noreply.github.com>
License: MIT License

Source code: https://github.com/hyperstown/pure-snow.js
https://codepen.io/YusukeNakaya/pen/NWPqvWW
https://codepen.io/alphardex/pen/dyPorwJ
-->

<script setup lang="ts">
import { useEventListener, useLocalStorage } from '@vueuse/core'
import { onMounted, useTemplateRef, watchEffect } from 'vue'

const shouldReduceMotion = useLocalStorage('docs:settings/reduce-motion', false)

const snowContainer = useTemplateRef<HTMLDivElement>('snowContainer')

const SNOWFLAKE_COUNT = 100

function randomInt(max = 100) {
  return Math.floor(Math.random() * max) + 1
}

function randomIntRange(min: number, max: number) {
  const ceilMin = Math.ceil(min)
  const floorMax = Math.floor(max)

  return Math.floor(Math.random() * (floorMax - ceilMin + 1)) + ceilMin
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function getPageHeightVh() {
  const bodyHeightPx = document.body.offsetHeight || window.innerHeight
  return (100 * bodyHeightPx) / window.innerHeight
}

function clearSnow() {
  const container = snowContainer.value
  if (!container)
    return

  container.innerHTML = ''
}

function generateSnowflakes(count: number) {
  const container = snowContainer.value
  if (!container)
    return

  clearSnow()

  const pageHeightVh = getPageHeightVh()

  for (let i = 0; i < count; i++) {
    const flake = document.createElement('div')
    flake.className = 'snowflake'

    const randomX = Math.random() * 100 // vw
    const randomOffset = Math.random() * 10 // vw
    const randomYoyoTime = randomBetween(0.3, 0.8)
    const randomScale = Math.random()
    const fallDuration = randomIntRange(10, (pageHeightVh / 10) * 3) // s
    const fallDelay = randomInt((pageHeightVh / 10) * 3) * -1 // s
    const opacity = Math.random()

    // All per-flake randomness lives in CSS custom properties so a single
    // shared @keyframes drives every flake (cheaper style recalc and CSS size).
    flake.style.setProperty('--x1', `${randomX}`)
    flake.style.setProperty('--x2', `${randomX + randomOffset}`)
    flake.style.setProperty('--x3', `${randomX + randomOffset / 2}`)
    flake.style.setProperty('--y2', `${randomYoyoTime * pageHeightVh}`)
    flake.style.setProperty('--y3', `${pageHeightVh}`)
    flake.style.setProperty('--scale', `${randomScale}`)
    flake.style.setProperty('--dur', `${fallDuration}s`)
    flake.style.setProperty('--delay', `${fallDelay}s`)
    flake.style.setProperty('--opacity', `${opacity}`)

    container.appendChild(flake)
  }
}

function createSnow() {
  const container = snowContainer.value
  if (!container)
    return

  const count = Number(container.dataset.count || SNOWFLAKE_COUNT)
  generateSnowflakes(count)
}

onMounted(() => {
  if (import.meta.env.SSR)
    return

  createSnow()
})

watchEffect((onCleanup) => {
  if (import.meta.env.SSR)
    return

  if (shouldReduceMotion.value) {
    clearSnow()
    snowContainer.value?.style.setProperty('display', 'none')
  }
  else {
    snowContainer.value?.style.removeProperty('display')
    createSnow()
    const stopResize = useEventListener('resize', () => createSnow())
    onCleanup(stopResize)
  }
})
</script>

<template>
  <div
    ref="snowContainer"
    :class="[
      'docs-theme-christmas-2025-12-24-snowfall',
      'pointer-events-none',
      'fixed',
      'inset-0',
      'z-100',
      'overflow-hidden',
    ]"
    aria-hidden="true"
  />
</template>

<style>
.docs-theme-christmas-2025-12-24-snowfall .snowflake {
  position: absolute;
  top: -10px;
  left: 0;
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.35);
  opacity: var(--opacity);
  transform: translate3d(calc(var(--x1) * 1vw), -10px, 0) scale(var(--scale));
  animation: snowfall var(--dur) linear var(--delay) infinite;
}

@keyframes snowfall {
  50% {
    transform: translate3d(calc(var(--x2) * 1vw), calc(var(--y2) * 1vh), 0) scale(var(--scale));
  }
  to {
    transform: translate3d(calc(var(--x3) * 1vw), calc(var(--y3) * 1vh), 0) scale(var(--scale));
  }
}
</style>
