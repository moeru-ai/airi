import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useVRM = defineStore('vrm', () => {
  const modelFile = ref<File>()
  const modelUrl = ref<string>('/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm')
  const loadSource = ref<'file' | 'url'>('url')
  const loadingModel = ref(false) // if set to true, the model will be loaded
  const position = useLocalStorage('settings/live2d/position', { x: 0, y: 0 }) // position is relative to the center of the screen, units are %
  const positionInPercentageString = computed(() => ({
    x: `${position.value.x}%`,
    y: `${position.value.y}%`,
  }))

  return {
    modelFile,
    modelUrl,
    loadSource,
    loadingModel,
    position,
    positionInPercentageString,
  }
})
