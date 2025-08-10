import localforage from 'localforage'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, onMounted, ref } from 'vue'

export const useVRM = defineStore('vrm', () => {
  const indexedDbModelFile = ref<File | null>(null)

  onMounted(async () => {
    const file = await localforage.getItem<File>('assets-models-vrm')
    if (file) {
      indexedDbModelFile.value = file
    }
  })

  const modelFile = computed({
    get: () => {
      return indexedDbModelFile.value
    },
    set: (file: File | null) => {
      if (file) {
        localforage.setItem('assets-models-vrm', file)
      }
      else {
        localforage.removeItem('assets-models-vrm')
      }

      indexedDbModelFile.value = file
    },
  })

  const defaultModelUrl = '/assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm'
  const modelUrl = useLocalStorage('settings/vrm/modelURL', defaultModelUrl)

  const scale = useLocalStorage('settings/vrm/cameraScale', 1)
  const modelSize = useLocalStorage('settings/vrm/modelSize', { x: 0, y: 0, z: 0 })
  const modelOrigin = useLocalStorage('settings/vrm/modelOrigin', { x: 0, y: 0, z: 0 })
  const modelOffset = useLocalStorage('settings/vrm/modelOffset', { x: 0, y: 0, z: 0 })
  const modelRotationY = useLocalStorage('settings/vrm/modelRotationY', 0)

  const cameraFOV = useLocalStorage('settings/vrm/cameraFOV', 40)
  const cameraPosition = useLocalStorage('settings/vrm/camera-position', { x: 0, y: 0, z: -1 })
  const cameraDistance = useLocalStorage('settings/vrm/cameraDistance', 0)

  const directionalLightPosition = useLocalStorage('settings/vrm/scenes/scene/directional-light/position', { x: 0, y: 0, z: -10 })
  const directionalLightTarget = useLocalStorage('settings/vrm/scenes/scene/directional-light/target', { x: 0, y: 0, z: 0 })
  const directionalLightRotation = useLocalStorage('settings/vrm/scenes/scene/directional-light/rotation', { x: 0, y: 0, z: 0 })
  // TODO: Manual directional light intensity will not work for other
  //       scenes with different lighting setups. But since the model
  //       is possible to have MeshToonMaterial, and MeshBasicMaterial
  //       without envMap to be able to inherit lighting from HDRI map,
  //       we will have to figure out a way to make this work to apply
  //       different directional light and other lighting setups
  //       for different environments.
  // WORKAROUND: To achieve the rendering style of Warudo for anime style
  //             Genshin Impact, or so called Cartoon style rendering with
  //             harsh shadows and bright highlights.
  // REVIEW: This is a temporary solution, and will be replaced with
  //         a more flexible lighting system in the future.
  const directionalLightIntensity = useLocalStorage('settings/vrm/scenes/scene/directional-light/intensity', 2.02)
  // TODO: color are the same
  const directionalLightColor = useLocalStorage('settings/vrm/scenes/scene/directional-light/color', '#fffbf5')

  const hemisphereLightPosition = useLocalStorage('settings/vrm/scenes/scene/hemisphere-light/position', { x: 0, y: 0, z: 0 })
  // TODO: color are the same
  const hemisphereSkyColor = useLocalStorage('settings/vrm/scenes/scene/hemisphere-light/sky-color', '#FFFFFF')
  // TODO: color are the same
  const hemisphereGroundColor = useLocalStorage('settings/vrm/scenes/scene/hemisphere-light/ground-color', '#000000')
  // TODO: The same as directional light, this is a temporary solution
  //       and will be replaced with a more flexible lighting system in the future.
  const hemisphereLightIntensity = useLocalStorage('settings/vrm/scenes/scene/hemisphere-light/intensity', 0.4)

  // TODO: color are the same
  const ambientLightColor = useLocalStorage('settings/vrm/scenes/scene/ambient-light/color', '#FFFFFF')
  // TODO: The same as directional light, this is a temporary solution
  //       and will be replaced with a more flexible lighting system in the future.
  const ambientLightIntensity = useLocalStorage('settings/vrm/scenes/scene/ambient-light/intensity', 0.6)

  const lookAtTarget = useLocalStorage('settings/vrm/lookAtTarget', { x: 0, y: 0, z: 0 })
  const isTracking = useLocalStorage('settings/vrm/isTracking', false)
  const trackingMode = useLocalStorage('settings/vrm/trackingMode', 'none' as 'camera' | 'mouse' | 'none')
  const eyeHeight = useLocalStorage('settings/vrm/eyeHeight', 0)

  return {
    modelFile,
    modelUrl,
    modelSize,

    scale,
    modelOrigin,
    modelOffset,
    modelRotationY,

    cameraFOV,
    cameraPosition,
    cameraDistance,

    directionalLightPosition,
    directionalLightTarget,
    directionalLightRotation,
    directionalLightIntensity,
    directionalLightColor,

    ambientLightIntensity,
    ambientLightColor,

    hemisphereLightPosition,
    hemisphereSkyColor,
    hemisphereGroundColor,
    hemisphereLightIntensity,

    lookAtTarget,
    isTracking,
    trackingMode,
    eyeHeight,
  }
})
