import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export const useVRM = defineStore('vrm', () => {
  const modelFile = ref<File>()
  const modelUrl = ref<string>('/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm')
  const loadSource = ref<'file' | 'url'>('url')
  const loadingModel = ref(false)
  const position = useLocalStorage('settings/vrm/position', { x: 0, y: 0 })
  const positionInPercentageString = computed(() => ({
  x: `${position.value.x}%`,
  y: `${position.value.y}%`,
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
  position,
  positionInPercentageString,
  selectedModel, // Expose the new computed property
  }
})
