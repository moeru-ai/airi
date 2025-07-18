import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
<<<<<<< HEAD
import { computed, ref, watch } from 'vue'
=======
import { computed, ref } from 'vue'
>>>>>>> de20e991 (add vrm model uploading functionality)

export const useVRM = defineStore('vrm', () => {
  const modelFile = ref<File>()
  const modelUrl = ref<string>('/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm')
  const loadSource = ref<'file' | 'url'>('url')
<<<<<<< HEAD
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

=======
  const loadingModel = ref(false) // if set to true, the model will be loaded
  const position = useLocalStorage('settings/live2d/position', { x: 0, y: 0 }) // position is relative to the center of the screen, units are %
  const positionInPercentageString = computed(() => ({
    x: `${position.value.x}%`,
    y: `${position.value.y}%`,
  }))

>>>>>>> de20e991 (add vrm model uploading functionality)
  return {
    modelFile,
    modelUrl,
    loadSource,
    loadingModel,
<<<<<<< HEAD
    modelSize,
    modelOrigin,
    modelOffset,
    modelPosition,
    positionInPercentageString,
    selectedModel, // Expose the new computed property
=======
    position,
    positionInPercentageString,
>>>>>>> de20e991 (add vrm model uploading functionality)
  }
})
