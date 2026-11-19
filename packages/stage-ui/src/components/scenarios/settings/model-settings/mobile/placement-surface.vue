<script setup lang="ts">
import { onUnmounted } from 'vue'

import { PlacementGestures } from './placement-gestures'

const scale = defineModel<number>('scale', { required: true })
const position = defineModel<{ x: number, y: number }>('position', { required: true })

// Each mounted surface owns its pointer session. Both entry points edit the same persisted model parameters.
const gestures = new PlacementGestures(scale, position)

/** Captures both fingers on the overlay, using the stage dimensions for percentage movement. */
function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement))
    return

  const surface = event.currentTarget
  surface.setPointerCapture(event.pointerId)
  gestures.start(event, surface.getBoundingClientRect())
}

onUnmounted(() => gestures.reset())
</script>

<template>
  <div
    aria-hidden="true"
    :class="['absolute inset-0 cursor-grab touch-none']"
    @pointerdown="onPointerDown"
    @pointermove="gestures.move($event)"
    @pointerup="gestures.end($event.pointerId)"
    @pointercancel="gestures.reset()"
    @lostpointercapture="gestures.end($event.pointerId)"
  />
</template>
