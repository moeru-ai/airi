import { useBroadcastChannel, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import defaultSkyBoxSrc from '../components/Scenes/Tres/assets/sky_linekotsi_23_HDRI.hdr?url'

type BroadcastChannelEvents
  = | BroadcastChannelEventShouldUpdateView

interface BroadcastChannelEventShouldUpdateView {
  type: 'should-update-view'
}

export const useVRM = defineStore('vrm', () => {
  const { post, data } = useBroadcastChannel<BroadcastChannelEvents, BroadcastChannelEvents>({ name: 'airi-stores-vrm' })
  const shouldUpdateViewHooks = ref<Array<() => void | Promise<void>>>([])

  const onShouldUpdateView = (hook: () => void | Promise<void>) => {
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

  // TODO: color are the same
  const hemisphereSkyColor = useLocalStorage('settings/vrm/scenes/scene/hemisphere-light/sky-color', '#FFFFFF')
  // TODO: color are the same
  // Lilia: The ground color is not pure black
  const hemisphereGroundColor = useLocalStorage('settings/vrm/scenes/scene/hemisphere-light/ground-color', '#222222')
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

  // environment related setting
  const envSelect = useLocalStorage('settings/vrm/envEnabled', 'skyBox' as 'hemisphere' | 'skyBox')
  const skyBoxSrc = useLocalStorage('settings/vrm/skyBoxUrl', defaultSkyBoxSrc)
  const specularMix = useLocalStorage('settings/vrm/specularMix', 0)
  const skyBoxIntensity = useLocalStorage('settings/vrm/skyBoxIntensity', 0.1)

  return {
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

    hemisphereSkyColor,
    hemisphereGroundColor,
    hemisphereLightIntensity,

    lookAtTarget,
    isTracking,
    trackingMode,
    eyeHeight,
    envSelect,
    skyBoxSrc,
    specularMix,
    skyBoxIntensity,

    shouldUpdateView,
    onShouldUpdateView,
  }
})
