<script setup lang="ts">
import { useElementVisibility } from '@vueuse/core'
import { clamp } from 'es-toolkit'
import { computed, ref } from 'vue'

import { useElementScroll } from './use-element-scroll'

const scrollerRef = ref<HTMLDivElement>()
const elementRef = ref<HTMLDivElement>()
const topSentinelRef = ref<HTMLDivElement>()
const bottomSentinelRef = ref<HTMLDivElement>()

const {
  scrollOffset,
  viewportHeight,
  elementHeight,
  innerHeight,
  innerTop,
  elementTop,
  visibleStart,
  visibleEnd,
  isVisible,
  hasMeasuredElement,
} = useElementScroll(elementRef, scrollerRef)

const topSentinelVisible = useElementVisibility(topSentinelRef, {
  initialValue: false,
  scrollTarget: scrollerRef,
})

const bottomSentinelVisible = useElementVisibility(bottomSentinelRef, {
  initialValue: false,
  scrollTarget: scrollerRef,
})

const floatingInMiddle = computed(() => !topSentinelVisible.value && !bottomSentinelVisible.value)
const floatingTop = computed(() => {
  if (!hasMeasuredElement.value || !isVisible.value || !floatingInMiddle.value)
    return 0

  const buttonSize = 32
  const relativeInnerMiddle = innerTop.value - elementTop.value + innerHeight.value / 2 - buttonSize / 2
  return clamp(relativeInnerMiddle, 0, Math.max(elementHeight.value - buttonSize, 0))
})
</script>

<template>
  <div class="h-[30rem] w-full flex flex-col border border-neutral-200/70 rounded-2xl bg-white/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/70">
    <div class="grid grid-cols-2 mb-3 gap-2 text-xs text-neutral-500 md:grid-cols-4 dark:text-neutral-400">
      <div>scrollOffset: {{ scrollOffset }}</div>
      <div>viewportHeight: {{ viewportHeight }}</div>
      <div>visibleStart: {{ Math.round(visibleStart) }}</div>
      <div>visibleEnd: {{ Math.round(visibleEnd) }}</div>
      <div>elementHeight: {{ Math.round(elementHeight) }}</div>
      <div>innerHeight: {{ Math.round(innerHeight) }}</div>
      <div>topVisible: {{ topSentinelVisible }}</div>
      <div>bottomVisible: {{ bottomSentinelVisible }}</div>
    </div>

    <div
      ref="scrollerRef"
      class="relative min-h-0 flex-1 overflow-y-auto border border-primary-200/70 rounded-xl bg-primary-50/50 p-6 dark:border-primary-900/70 dark:bg-primary-950/20"
    >
      <div class="h-32 border border-neutral-300/70 rounded-xl border-dashed bg-white/70 p-4 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-400">
        Scroll down until the top sentinel leaves the viewport, then the marker should stay in the visible middle.
      </div>

      <div
        ref="elementRef"
        class="relative mt-6 border border-neutral-200 rounded-2xl bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div ref="topSentinelRef" class="pointer-events-none absolute inset-x-0 top-0 h-px opacity-0" />
        <div ref="bottomSentinelRef" class="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0" />

        <div class="absolute right-0 top-0 translate-x-[calc(100%+8px)]">
          <div
            v-if="!topSentinelVisible"
            class="absolute h-8 w-8 flex items-center justify-center rounded-lg bg-primary-500 text-white shadow-md"
            :class="bottomSentinelVisible ? 'bottom-0' : 'top-0'"
            :style="bottomSentinelVisible ? undefined : { top: `${floatingTop}px` }"
          >
            <div class="i-solar:menu-dots-bold text-base" />
          </div>
        </div>

        <div class="space-y-4">
          <p
            v-for="index in 20"
            :key="index"
            class="text-sm text-neutral-600 leading-7 dark:text-neutral-300"
          >
            Visualizer paragraph {{ index }}. This tall block exists only to inspect the visible slice inside the scroll container and verify that the action position tracks the middle while the top and bottom sentinels switch state.
          </p>
        </div>
      </div>

      <div class="h-40" />
    </div>
  </div>
</template>
