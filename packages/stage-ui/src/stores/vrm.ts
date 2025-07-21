import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export const useVRM = defineStore('vrm', () => {
  const modelFile = ref<File>()

  const defaultModelUrl = '/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm'
  const modelUrl = useLocalStorage('settings/vrm/modelURL', '')

  const loadSource = ref<'file' | 'url'>('url')
  const loadingModel = ref(false)

  const scale = useLocalStorage('settings/live2d/cameraScale', 1)
  const modelSize = useLocalStorage('settings/vrm/modelSize', { x: 0, y: 0, z: 0 })
  const modelOrigin = useLocalStorage('settings/vrm/modelOrigin', { x: 0, y: 0, z: 0 })
  const modelOffset = useLocalStorage('settings/vrm/modelOffset', { x: 0, y: 0, z: 0 })

  const position = computed(() => ({
    x: modelOrigin.value.x + modelOffset.value.x,
    y: modelOrigin.value.y + modelOffset.value.y,
    z: modelOrigin.value.z + modelOffset.value.z,
  }))
  const positionInPercentageString = computed(() => ({
    x: `${position.value.x}%`,
    y: `${position.value.y}%`,
    z: `${position.value.z}%`,
  }))
  const cameraFOV = useLocalStorage('settings/vrm/cameraFOV', 40)
  const initialCameraPosition = useLocalStorage('settings/vrm/initialCameraPosition', { x: 0, y: 0, z: -1 })

  const modelObjectUrl = ref<string>()
  const modelRotationY = useLocalStorage('settings/vrm/modelRotationY', 0)

  // Manage the object URL lifecycle to prevent memory leaks
  watch(modelFile, (newFile) => {
    if (modelObjectUrl.value) {
      URL.revokeObjectURL(modelObjectUrl.value)
      modelObjectUrl.value = undefined
    }
    if (newFile) {
      modelObjectUrl.value = URL.createObjectURL(newFile)
    }
  })

  const selectedModel = computed(() => {
    if (loadSource.value === 'file' && modelObjectUrl.value) {
      return modelObjectUrl.value
    }
    if (loadSource.value === 'url' && modelUrl.value) {
      return modelUrl.value
    }
    // Fallback model
    return defaultModelUrl
  })

  return {
    modelFile,
    defaultModelUrl,
    modelUrl,
    loadSource,
    loadingModel,
    modelSize,
    scale,
    modelOrigin,
    modelOffset,
    position,
    positionInPercentageString,
    selectedModel,
    cameraFOV,
    initialCameraPosition,
    modelRotationY,
  }
})
