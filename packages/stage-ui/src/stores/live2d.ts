import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { createResettableLocalStorage, createResettableRef } from '../utils/resettable'

type BroadcastChannelEvents
  = | BroadcastChannelEventShouldUpdateView

interface BroadcastChannelEventShouldUpdateView {
  type: 'should-update-view'
}

export const defaultModelParameters = {
  angleX: 0,
  angleY: 0,
  angleZ: 0,
  leftEyeOpen: 1,
  rightEyeOpen: 1,
  leftEyeSmile: 0,
  rightEyeSmile: 0,
  leftEyebrowLR: 0,
  rightEyebrowLR: 0,
  leftEyebrowY: 0,
  rightEyebrowY: 0,
  leftEyebrowAngle: 0,
  rightEyebrowAngle: 0,
  leftEyebrowForm: 0,
  rightEyebrowForm: 0,
  mouthOpen: 0,
  mouthForm: 0,
  cheek: 0,
  bodyAngleX: 0,
  bodyAngleY: 0,
  bodyAngleZ: 0,
  breath: 0,
}

export const useLive2d = defineStore('live2d', () => {
  const { post, data } = useBroadcastChannel<BroadcastChannelEvents, BroadcastChannelEvents>({ name: 'airi-stores-live2d' })
  const shouldUpdateViewHooks = ref<Array<() => void>>([])

  const onShouldUpdateView = (hook: () => void) => {
    shouldUpdateViewHooks.value.push(hook)
  }

  function shouldUpdateView() {
    post({ type: 'should-update-view' })
    shouldUpdateViewHooks.value.forEach(hook => hook())
  }

  watch(data, (event) => {
    if (event.type === 'should-update-view') {
      shouldUpdateViewHooks.value.forEach(hook => hook())
    }
  })

  const [position, resetPosition] = createResettableLocalStorage('settings/live2d/position', { x: 0, y: 0 }) // position is relative to the center of the screen, units are %
  const positionInPercentageString = computed(() => ({
    x: `${position.value.x}%`,
    y: `${position.value.y}%`,
  }))
  const [currentMotion, resetCurrentMotion] = createResettableRef<{ group: string, index?: number }>({ group: 'Idle', index: 0 })
  const [availableMotions, resetAvailableMotions] = createResettableRef<{ motionName: string, motionIndex: number, fileName: string }[]>([])
  const [motionMap, resetMotionMap] = createResettableLocalStorage<Record<string, string>>('settings/live2d/motion-map', {})
  const [scale, resetScale] = createResettableLocalStorage('settings/live2d/scale', 1)

  // Live2D model parameters
  const [modelParameters, resetModelParameters] = createResettableLocalStorage('settings/live2d/parameters', defaultModelParameters)

  function resetState() {
    resetPosition()
    resetCurrentMotion()
    resetAvailableMotions()
    resetMotionMap()
    resetScale()
    resetModelParameters()
    shouldUpdateView()
  }

  return {
    position,
    positionInPercentageString,
    currentMotion,
    availableMotions,
    motionMap,
    scale,
    modelParameters,

    onShouldUpdateView,
    shouldUpdateView,
    resetState,
  }
})
