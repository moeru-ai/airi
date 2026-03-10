import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

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
  const shouldUpdateViewHooks = ref(new Set<() => void>())

  const onShouldUpdateView = (hook: () => void) => {
    shouldUpdateViewHooks.value.add(hook)
    return () => {
      shouldUpdateViewHooks.value.delete(hook)
    }
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

  const position = useLocalStorageManualReset<{ x: number, y: number }>('settings/live2d/position', { x: 0, y: 0 }) // position is relative to the center of the screen, units are %
  const positionInPercentageString = computed(() => ({
    x: `${position.value.x}%`,
    y: `${position.value.y}%`,
  }))
  const currentMotion = useLocalStorageManualReset<{ group: string, index?: number }>('settings/live2d/current-motion', () => ({ group: 'Idle', index: 0 }))
  const availableMotions = useLocalStorageManualReset<{ motionName: string, motionIndex: number, fileName: string }[]>('settings/live2d/available-motions', () => [])
  const motionMap = useLocalStorageManualReset<Record<string, string>>('settings/live2d/motion-map', {})
  const scale = useLocalStorageManualReset('settings/live2d/scale', 1)

  // Meta information from CDI and EXP files
  const availableExpressions = useLocalStorageManualReset<{ name: string, fileName: string }[]>('settings/live2d/available-expressions', () => [])
  const parameterMetadata = useLocalStorageManualReset<{ id: string, name: string, groupId?: string, groupName?: string }[]>('settings/live2d/parameter-metadata', () => [])
  const emotionMappings = useLocalStorageManualReset<Record<string, string>>('settings/live2d/emotion-mappings', {})
  const activeExpressions = useLocalStorageManualReset<Record<string, number>>('settings/live2d/active-expressions', {})
  const expressionData = ref<Array<{ name: string, fileName: string, data: any }>>([])

  // Live2D model parameters
  const modelParameters = useLocalStorageManualReset<Record<string, number>>('settings/live2d/parameters', defaultModelParameters)

  function resetState() {
    position.reset()
    currentMotion.reset()
    availableMotions.reset()
    motionMap.reset()
    scale.reset()
    availableExpressions.reset()
    parameterMetadata.reset()
    emotionMappings.reset()
    activeExpressions.reset()
    modelParameters.reset()
    shouldUpdateView()
  }

  return {
    position,
    positionInPercentageString,
    currentMotion,
    availableMotions,
    motionMap,
    scale,
    availableExpressions,
    parameterMetadata,
    emotionMappings,
    activeExpressions,
    expressionData,
    modelParameters,

    onShouldUpdateView,
    shouldUpdateView,
    resetState,
  }
})
