import type { Vector3 } from 'three'

import { useBroadcastChannel, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import defaultSkyBoxSrc from '../components/Environment/assets/sky_linekotsi_23_HDRI.hdr?url'

// TODO: this is for future type injection features
// TODO: make a separate type.ts
export interface Vec3 { x: number, y: number, z: number }
export type TrackingMode = 'camera' | 'mouse' | 'none'
export type HexColor = string & { __hex?: true }

export interface FieldBase<T> {
  space: string // name space
  key: string // name key
  default: T // default value
  // For future setting components UI display
  label: string
  group: string
  order: number
}
export type NumberField = FieldBase<number> & {
  type: 'number'
  min?: number
  max?: number
  step?: number
}
export type Vec3Field = FieldBase<Vector3> & {
  type: 'vec3'
}
export type ColorField = FieldBase<HexColor> & {
  type: 'color'
}
export type SelectField<T extends string = string> = FieldBase<T> & {
  type: 'select'
  options: readonly { label: string, value: T }[]
}

export interface FieldKindMap {
  number: { def: NumberField, value: number }
  vec3: { def: Vec3Field, value: Vector3 }
  color: { def: ColorField, value: HexColor }
  select: { def: SelectField<any>, value: string }
}
// type of Field
export type FieldDef = FieldKindMap[keyof FieldKindMap]['def']
// type of value
export type FieldValueOf<D> = D extends SelectField<infer T> ? T
  : D extends { type: infer K }
    ? K extends keyof FieldKindMap ? FieldKindMap[K]['value'] : never
    : never

type BroadcastChannelEvents
  = | BroadcastChannelEventShouldUpdateView

interface BroadcastChannelEventShouldUpdateView {
  type: 'should-update-view'
}

export const useModelStore = defineStore('modelStore', () => {
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

  const scale = useLocalStorage('settings/stage-ui-three/scale', 1)
  const lastModelSrc = useLocalStorage('settings/stage-ui-three/lastModelSrc', '')

  const modelSize = useLocalStorage('settings/stage-ui-three/modelSize', { x: 0, y: 0, z: 0 })
  const modelOrigin = useLocalStorage('settings/stage-ui-three/modelOrigin', { x: 0, y: 0, z: 0 })
  const modelOffset = useLocalStorage('settings/stage-ui-three/modelOffset', { x: 0, y: 0, z: 0 })
  const modelRotationY = useLocalStorage('settings/stage-ui-three/modelRotationY', 0)

  const cameraFOV = useLocalStorage('settings/stage-ui-three/cameraFOV', 40)
  const cameraPosition = useLocalStorage('settings/stage-ui-three/camera-position', { x: 0, y: 0, z: -1 })
  const cameraDistance = useLocalStorage('settings/stage-ui-three/cameraDistance', 0)

  const lookAtTarget = useLocalStorage('settings/stage-ui-three/lookAtTarget', { x: 0, y: 0, z: 0 })
  const trackingMode = useLocalStorage('settings/stage-ui-three/trackingMode', 'none' as 'camera' | 'mouse' | 'none')
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

  // === Lighting ===
  const directionalLightPosition = useLocalStorage('settings/stage-ui-three/scenes/scene/directional-light/position', { x: 0, y: 0, z: -1 })
  const directionalLightTarget = useLocalStorage('settings/stage-ui-three/scenes/scene/directional-light/target', { x: 0, y: 0, z: 0 })
  const directionalLightRotation = useLocalStorage('settings/stage-ui-three/scenes/scene/directional-light/rotation', { x: 0, y: 0, z: 0 })
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
  const directionalLightIntensity = useLocalStorage('settings/stage-ui-three/scenes/scene/directional-light/intensity', 2.02)
  // TODO: color are the same
  const directionalLightColor = useLocalStorage('settings/stage-ui-three/scenes/scene/directional-light/color', '#fffbf5')

  const hemisphereSkyColor = useLocalStorage('settings/stage-ui-three/scenes/scene/hemisphere-light/sky-color', '#FFFFFF')
  const hemisphereGroundColor = useLocalStorage('settings/stage-ui-three/scenes/scene/hemisphere-light/ground-color', '#222222')
  const hemisphereLightIntensity = useLocalStorage('settings/stage-ui-three/scenes/scene/hemisphere-light/intensity', 0.4)

  const ambientLightColor = useLocalStorage('settings/stage-ui-three/scenes/scene/ambient-light/color', '#FFFFFF')
  const ambientLightIntensity = useLocalStorage('settings/stage-ui-three/scenes/scene/ambient-light/intensity', 0.6)

  // environment related setting
  const envSelect = useLocalStorage('settings/stage-ui-three/envEnabled', 'hemisphere' as 'hemisphere' | 'skyBox')
  const skyBoxSrc = useLocalStorage('settings/stage-ui-three/skyBoxUrl', defaultSkyBoxSrc)
  const skyBoxIntensity = useLocalStorage('settings/stage-ui-three/skyBoxIntensity', 0.1)

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
