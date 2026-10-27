<script setup lang="ts">
import type { ReleaseShot } from './release-shots'

import { computed } from 'vue'

import { useReleaseShot } from './release-shots'

/**
 * Shows one rectangle of a screenshot, in the theme of the current area.
 *
 * `rect` uses the CSS pixels of the screen that took the screenshot, not the image pixels.
 */
const props = withDefaults(defineProps<{
  shot: ReleaseShot
  /** `[x, y, width, height]` of the shown rectangle. */
  rect: [number, number, number, number]
  scale?: number
}>(), {
  scale: 1,
})

const shotSrc = useReleaseShot()

const box = computed(() => {
  const [x, y, width, height] = props.rect
  return {
    frame: { width: `${width * props.scale}px`, height: `${height * props.scale}px` },
    image: { width: `${props.shot.width * props.scale}px`, left: `${-x * props.scale}px`, top: `${-y * props.scale}px` },
  }
})
</script>

<template>
  <div :class="['relative shrink-0 overflow-hidden']" :style="box.frame">
    <img :src="shotSrc(props.shot)" :class="['absolute block max-w-none select-none']" :style="box.image" draggable="false">
  </div>
</template>
