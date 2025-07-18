import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export const useVRM = defineStore('vrm', () => {
  const modelFile = ref<File>()
  const modelUrl = ref<string>('/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm')
  const loadSource = ref<'file' | 'url'>('url')
  const loadingModel = ref(false)
  const modelSize = useLocalStorage('settings/vrm/modelSize', { x: 0, y: 0, z: 0 })
  const modelOrigin = useLocalStorage('settings/vrm/modelOrigin', { x: 0, y: 0, z: 0 })
  const modelOffset = useLocalStorage('settings/vrm/modelOffset', { x: 0, y: 0, z: 0 })
  const modelPosition = computed(() => ({
    x: modelOrigin.value.x + modelOffset.value.x,
    y: modelOrigin.value.y + modelOffset.value.y,
    z: modelOrigin.value.z + modelOffset.value.z,
  }))
  const positionInPercentageString = computed(() => ({
    x: `${modelPosition.value.x}%`,
    y: `${modelPosition.value.y}%`,
    z: `${modelPosition.value.z}%`,
  }))

  const modelObjectUrl = ref<string>()

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

  // Centralized computed property for the model source
  const selectedModel = computed(() => {
    if (loadSource.value === 'file' && modelObjectUrl.value) {
      return modelObjectUrl.value
    }
    if (loadSource.value === 'url' && modelUrl.value) {
      return modelUrl.value
    }
    // Fallback model
    return '/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm'
  })

  return {
    modelFile,
    modelUrl,
    loadSource,
    loadingModel,
    modelSize,
    modelOrigin,
    modelOffset,
    modelPosition,
    positionInPercentageString,
    selectedModel, // Expose the new computed property
  }
})

