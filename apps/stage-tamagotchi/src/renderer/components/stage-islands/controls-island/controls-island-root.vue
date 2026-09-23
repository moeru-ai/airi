<script setup lang="ts">
import type { ControlsIslandDock, ControlsIslandMotionPhase, ControlsIslandPlacement } from './use-controls-island-placement'

import { useElectronAllDisplays, useElectronWindowBounds } from '@proj-airi/electron-vueuse'
import { refDebounced, usePreferredReducedMotion, useTimeoutFn } from '@vueuse/core'
import { computed, provide, shallowRef, watch } from 'vue'

import { controlsIslandPlacementKey, resolveControlsIslandDock } from './use-controls-island-placement'

interface Props {
  /** Prevents the Island from moving while a user interacts with it. */
  frozen: boolean
}

const props = defineProps<Props>()

defineSlots<{
  default: () => unknown
}>()

const displays = useElectronAllDisplays()
const windowBounds = useElectronWindowBounds()
const preferredMotion = usePreferredReducedMotion()
const dock = shallowRef<ControlsIslandDock>('bottom-right')
const pendingDock = shallowRef<ControlsIslandDock>()
const relocationTarget = shallowRef<ControlsIslandDock>()
const motionPhase = shallowRef<ControlsIslandMotionPhase>('idle')

/** The window must stay still for this period before the Island changes corners. */
const placementSettleDelayMs = 1000

/** The old corner fades out before the dock changes. */
const placementLeaveDurationMs = 150

/** One frame keeps the new corner hidden before its entrance starts. */
const placementEnterPreparationMs = 16

/** The new corner fades in and moves into its resting position. */
const placementArrivalDurationMs = 150

const { start: finishArrival, stop: stopArrival } = useTimeoutFn(() => {
  motionPhase.value = 'idle'
  relocationTarget.value = undefined
}, placementArrivalDurationMs, { immediate: false })

const { start: startArrival, stop: stopEnterPreparation } = useTimeoutFn(() => {
  motionPhase.value = 'arriving'
  finishArrival()
}, placementEnterPreparationMs, { immediate: false })

const { start: finishLeave, stop: stopLeave } = useTimeoutFn(() => {
  if (!relocationTarget.value) {
    motionPhase.value = 'idle'
    return
  }

  dock.value = relocationTarget.value
  motionPhase.value = 'entering'
  startArrival()
}, placementLeaveDurationMs, { immediate: false })

function stopRelocation() {
  stopLeave()
  stopEnterPreparation()
  stopArrival()
}

function relocate(nextDock: ControlsIslandDock) {
  stopRelocation()

  if (nextDock === dock.value) {
    relocationTarget.value = undefined
    motionPhase.value = 'idle'
    return
  }

  if (preferredMotion.value === 'reduce') {
    dock.value = nextDock
    relocationTarget.value = undefined
    motionPhase.value = 'idle'
    return
  }

  relocationTarget.value = nextDock
  motionPhase.value = 'leaving'
  finishLeave()
}

const liveWindowBounds = computed(() => ({
  x: windowBounds.x.value,
  y: windowBounds.y.value,
  width: windowBounds.width.value,
  height: windowBounds.height.value,
}))
const settledWindowBounds = refDebounced(liveWindowBounds, placementSettleDelayMs)
const candidateDock = computed(() => resolveControlsIslandDock({
  displays: displays.value,
  previousDock: dock.value,
  windowBounds: settledWindowBounds.value,
}))

watch(candidateDock, (nextDock) => {
  if (props.frozen) {
    pendingDock.value = nextDock
    return
  }

  relocate(nextDock)
  pendingDock.value = undefined
}, { immediate: true })

watch(() => props.frozen, (frozen) => {
  if (frozen || !pendingDock.value) {
    return
  }

  relocate(pendingDock.value)
  pendingDock.value = undefined
})

const isLeft = computed(() => dock.value.endsWith('left'))
const isTop = computed(() => dock.value.startsWith('top'))
const placement: ControlsIslandPlacement = {
  dock,
  isLeft,
  isTop,
  motionPhase,
}

provide(controlsIslandPlacementKey, placement)
</script>

<template>
  <slot />
</template>
