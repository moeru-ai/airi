import type { HexColor, TrackingMode, Vec3 } from './model-store.types'

import { useBroadcastChannel, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import defaultSkyBoxSrc from '../components/Environment/assets/sky_linekotsi_23_HDRI.hdr?url'

export type { Vec3 } from './model-store.types'

type BroadcastChannelEvents
  = | BroadcastChannelEventShouldUpdateView

interface BroadcastChannelEventShouldUpdateView {
  type: 'should-update-view'
}

export const useModelStore = defineStore('modelStore', () => {
  const { post, data } = useBroadcastChannel<BroadcastChannelEvents, BroadcastChannelEvents>({ name: 'airi-stores-live2d' })
  const shouldUpdateViewHooks = ref<Array<() => void>>([])

  const onShouldUpdateView = (hook: () => void) => {
    shouldUpdateViewHooks.value.push(hook)
    return () => {
      shouldUpdateViewHooks.value = shouldUpdateViewHooks.value.filter(h => h !== hook)
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

  const scale = useLocalStorage('settings/stage-ui-three/scale', 1)
  const lastModelSrc = useLocalStorage('settings/stage-ui-three/lastModelSrc', '')

  const modelSize = useLocalStorage<Vec3>('settings/stage-ui-three/modelSize', { x: 0, y: 0, z: 0 })
  const modelOrigin = useLocalStorage<Vec3>('settings/stage-ui-three/modelOrigin', { x: 0, y: 0, z: 0 })
  const modelOffset = useLocalStorage<Vec3>('settings/stage-ui-three/modelOffset', { x: 0, y: 0, z: 0 })
  const modelRotationY = useLocalStorage('settings/stage-ui-three/modelRotationY', 0)

  const cameraFOV = useLocalStorage('settings/stage-ui-three/cameraFOV', 40)
  const cameraPosition = useLocalStorage<Vec3>('settings/stage-ui-three/camera-position', { x: 0, y: 0, z: -1 })
  const cameraDistance = useLocalStorage('settings/stage-ui-three/cameraDistance', 0)

  const lookAtTarget = useLocalStorage<Vec3>('settings/stage-ui-three/lookAtTarget', { x: 0, y: 0, z: 0 })
  const trackingMode = useLocalStorage<TrackingMode>('settings/stage-ui-three/trackingMode', 'none')
  const eyeHeight = useLocalStorage('settings/stage-ui-three/eyeHeight', 0)

  function resetModelStore() {
    modelSize.value = { x: 0, y: 0, z: 0 }
    modelOrigin.value = { x: 0, y: 0, z: 0 }
    modelOffset.value = { x: 0, y: 0, z: 0 }
    modelRotationY.value = 0

    cameraFOV.value = 40
    cameraPosition.value = { x: 0, y: 0, z: 0 }
    cameraDistance.value = 0

    lookAtTarget.value = { x: 0, y: 0, z: 0 }
    trackingMode.value = 'none'
    eyeHeight.value = 0
  }

  // === Environment ===
  const envSelect = useLocalStorage<'hemisphere' | 'skyBox'>('settings/stage-ui-three/envEnabled', 'hemisphere')
  const skyBoxSrc = useLocalStorage('settings/stage-ui-three/skyBoxUrl', defaultSkyBoxSrc)
  const skyBoxIntensity = useLocalStorage('settings/stage-ui-three/skyBoxIntensity', 0.1)

  // === Lighting ===
  const directionalLightPosition = useLocalStorage<Vec3>('settings/stage-ui-three/scenes/scene/directional-light/position', { x: 0, y: 0, z: -1 })
  const directionalLightTarget = useLocalStorage<Vec3>('settings/stage-ui-three/scenes/scene/directional-light/target', { x: 0, y: 0, z: 0 })
  const directionalLightRotation = useLocalStorage<Vec3>('settings/stage-ui-three/scenes/scene/directional-light/rotation', { x: 0, y: 0, z: 0 })

  // Per-environment directional light presets to avoid one-size-fits-all intensity/color.
  const directionalLightSettingsByEnv = useLocalStorage<Record<'hemisphere' | 'skyBox', { intensity: number, color: HexColor }>>(
    'settings/stage-ui-three/scenes/scene/directional-light/settingsByEnv',
    {
      hemisphere: { intensity: 2.02, color: '#fffbf5' },
      skyBox: { intensity: 1.2, color: '#ffffff' },
    },
  )

  const directionalLightIntensity = computed(() => directionalLightSettingsByEnv.value[envSelect.value]?.intensity ?? 2.02)
  const directionalLightColor = computed(() => directionalLightSettingsByEnv.value[envSelect.value]?.color ?? '#fffbf5')

  const hemisphereSkyColor = useLocalStorage<HexColor>('settings/stage-ui-three/scenes/scene/hemisphere-light/sky-color', '#FFFFFF')
  const hemisphereGroundColor = useLocalStorage<HexColor>('settings/stage-ui-three/scenes/scene/hemisphere-light/ground-color', '#222222')
  const hemisphereLightIntensity = useLocalStorage('settings/stage-ui-three/scenes/scene/hemisphere-light/intensity', 0.4)

  const ambientLightColor = useLocalStorage<HexColor>('settings/stage-ui-three/scenes/scene/ambient-light/color', '#FFFFFF')
  const ambientLightIntensity = useLocalStorage('settings/stage-ui-three/scenes/scene/ambient-light/intensity', 0.6)

  return {
    scale,
    lastModelSrc,

    modelSize,
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
    trackingMode,
    eyeHeight,
    envSelect,
    skyBoxSrc,
    skyBoxIntensity,

    onShouldUpdateView,
    shouldUpdateView,

    resetModelStore,
  }
})
