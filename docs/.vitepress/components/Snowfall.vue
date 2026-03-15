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

const SNOWFLAKE_COUNT = 160
const STYLE_ELEMENT_ID = 'snowfall-dynamic-css'

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

function getHeights() {
  const bodyHeightPx = document.body.offsetHeight || window.innerHeight
  const pageHeightVh = (100 * bodyHeightPx) / window.innerHeight

  return { bodyHeightPx, pageHeightVh }
}

function ensureStyleElement() {
  let styleEl = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = STYLE_ELEMENT_ID
    document.head.appendChild(styleEl)
  }

  return styleEl
}

function generateSnowCSS(count: number, pageHeightVh: number) {
  let rule = ''
  const snowflakeName = 'snowflake'

  for (let i = 1; i <= count; i++) {
    const randomX = Math.random() * 100 // vw
    const randomOffset = Math.random() * 10 // vw
    const randomXEnd = randomX + randomOffset
    const randomXEndYoyo = randomX + randomOffset / 2
    const randomYoyoTime = randomBetween(0.3, 0.8)
    const randomYoyoY = randomYoyoTime * pageHeightVh // vh
    const randomScale = Math.random()
    const fallDuration = randomIntRange(10, (pageHeightVh / 10) * 3) // s
    const fallDelay = randomInt((pageHeightVh / 10) * 3) * -1 // s
    const opacity = Math.random()

    rule += `
      .${snowflakeName}:nth-child(${i}) {
        opacity: ${opacity};
        transform: translate(${randomX}vw, -10px) scale(${randomScale});
        animation: fall-${i} ${fallDuration}s ${fallDelay}s linear infinite;
      }

      @keyframes fall-${i} {
        ${randomYoyoTime * 100}% {
          transform: translate(${randomXEnd}vw, ${randomYoyoY}vh) scale(${randomScale});
        }
        to {
          transform: translate(${randomXEndYoyo}vw, ${pageHeightVh}vh) scale(${randomScale});
        }
      }
    `
  }

  ensureStyleElement().textContent = rule
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

  container.innerHTML = ''

  for (let i = 0; i < count; i++) {
    const flake = document.createElement('div')
    flake.className = 'snowflake'
    container.appendChild(flake)
  }
}

function createSnow() {
  const container = snowContainer.value
  if (!container)
    return

  const count = Number(container.dataset.count || SNOWFLAKE_COUNT)
  const { pageHeightVh } = getHeights()

  generateSnowCSS(count, pageHeightVh)
  generateSnowflakes(count)
}

onMounted(() => {
  if (import.meta.env.SSR)
    return

  createSnow()
})

watchEffect(() => {
  if (import.meta.env.SSR)
    return

  const handleResize = () => createSnow()

  if (shouldReduceMotion.value) {
    clearSnow()
    snowContainer.value?.style.setProperty('display', 'none')
  }
  else {
    snowContainer.value?.style.removeProperty('display')
    createSnow()
    useEventListener('resize', handleResize)
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
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.35);
  will-change: transform;
}
</style>
