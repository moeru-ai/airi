<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { computeScenarioCanvasScale } from '../../runtime/scene-canvas'

const props = withDefaults(defineProps<{
  width?: number
  height?: number
  scaleMultiplier?: number
}>(), {
  width: 1920,
  height: 1080,
  scaleMultiplier: 1,
})

const canvasRoot = ref<HTMLElement | null>(null)
const viewportWidth = ref(0)
const viewportHeight = ref(0)

let resizeObserver: ResizeObserver | null = null

/**
 * Tracks the actual viewport available to the scenario host.
 *
 * The important part is that child content does not use these dimensions
 * directly for layout. They are only used to compute a single scale factor for
 * the fixed logical surface below.
 */
function updateViewportSize(): void {
  viewportWidth.value = canvasRoot.value?.clientWidth ?? window.innerWidth
  viewportHeight.value = canvasRoot.value?.clientHeight ?? window.innerHeight
}

onMounted(() => {
  updateViewportSize()
  window.addEventListener('resize', updateViewportSize)

  if ('ResizeObserver' in window && canvasRoot.value) {
    resizeObserver = new ResizeObserver(() => updateViewportSize())
    resizeObserver.observe(canvasRoot.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewportSize)
  resizeObserver?.disconnect()
})

const scale = computed(() => computeScenarioCanvasScale({
  viewportWidth: viewportWidth.value,
  viewportHeight: viewportHeight.value,
  canvasWidth: props.width,
  canvasHeight: props.height,
  scaleMultiplier: props.scaleMultiplier,
}))

/**
 * The outer wrapper owns centering in real viewport pixels. It uses the scaled
 * dimensions so layout centering is based on the final visible box, not the
 * unscaled logical canvas size.
 */
const wrapperStyle = computed(() => ({
  width: `${props.width * scale.value}px`,
  height: `${props.height * scale.value}px`,
  transform: 'translate(-50%, -50%)',
}))

/**
 * The inner surface always keeps its logical pixel size. Absolute-positioned
 * children are laid out against this stable coordinate system, while scaling is
 * applied inside the already-centered wrapper.
 *
 * This avoids the "drifting translate" problem that happens when windows are
 * positioned inside a naturally responsive container whose width/height changes
 * with the browser viewport.
 *
 * Slidev uses the same pattern in:
 * - `slidev/packages/client/internals/SlideContainer.vue`
 * - `slidev/packages/client/internals/SlideWrapper.vue`
 */
const surfaceStyle = computed(() => ({
  width: `${props.width}px`,
  height: `${props.height}px`,
  transform: `scale(${scale.value})`,
}))
</script>

<template>
  <main
    ref="canvasRoot"
    :class="[
      'relative h-screen w-full overflow-hidden',
    ]"
  >
    <div
      :class="[
        'absolute left-1/2 top-1/2',
      ]"
      :style="wrapperStyle"
    >
      <div
        data-scenario-canvas-surface
        :class="[
          'origin-top-left',
        ]"
        :style="surfaceStyle"
      >
        <slot />
      </div>
    </div>
  </main>
</template>
