import localforage from 'localforage'

import { useBroadcastChannel, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

type BroadcastChannelEvents
  = | BroadcastChannelEventShouldUpdateView

interface BroadcastChannelEventShouldUpdateView {
  type: 'should-update-view'
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

  const indexedDbModelFile = ref<File | null>(null)

  onMounted(async () => await loadModelFileFromIndexedDb())
  onShouldUpdateView(async () => await loadModelFileFromIndexedDb())

  async function loadModelFileFromIndexedDb() {
    const file = await localforage.getItem<File>('assets-models-live2d')
    if (file) {
      indexedDbModelFile.value = file
    }
  }

  const modelFile = computed({
    get: () => {
      return indexedDbModelFile.value
    },
    set: (file: File | null) => {
      if (file) {
        localforage.setItem('assets-models-live2d', file)
      }
      else {
        localforage.removeItem('assets-models-live2d')
      }

      indexedDbModelFile.value = file
    },
  })

  const defaultModelUrl = '/assets/live2d/models/hiyori_pro_zh.zip'
  const modelUrl = useLocalStorage<string>('settings/live2d/model-src', defaultModelUrl)

  const loadingModel = ref(false) // if set to true, the model will be loaded
  const position = useLocalStorage('settings/live2d/position', { x: 0, y: 0 }) // position is relative to the center of the screen, units are %
  const positionInPercentageString = computed(() => ({
    x: `${position.value.x}%`,
    y: `${position.value.y}%`,
  }))
  const currentMotion = ref<{ group: string, index?: number }>({ group: 'Idle', index: 0 })
  const availableMotions = ref<{ motionName: string, motionIndex: number, fileName: string }[]>([])
  const motionMap = useLocalStorage<Record<string, string>>('settings/live2d/motion-map', {})
  const scale = useLocalStorage('settings/live2d/scale', 1)

  return {
    modelFile,
    modelUrl,
    loadingModel,
    position,
    positionInPercentageString,
    currentMotion,
    availableMotions,
    motionMap,
    scale,

    onShouldUpdateView,
    shouldUpdateView,
  }
})
