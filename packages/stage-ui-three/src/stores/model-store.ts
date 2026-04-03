import type { Vector3 } from 'three'

import { useBroadcastChannel, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import defaultSkyBoxSrc from '../components/Environment/assets/sky_linekotsi_23_HDRI.hdr?url'

// TODO: this is for future type injection features
// TODO: make a separate type.ts
export interface Vec3 { x: number, y: number, z: number }
export interface SceneBootstrap {
  cacheHit: boolean
  cameraDistance: number
  cameraPosition: Vec3
  eyeHeight: number
  lookAtTarget: Vec3
  modelOffset: Vec3
  modelOrigin: Vec3
  modelSize: Vec3
}
export type TrackingMode = 'camera' | 'mouse' | 'none'
export type ScenePhase = 'pending' | 'loading' | 'binding' | 'mounted' | 'no-model' | 'error'
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
  type: 'vrm-should-update-view'
  href: string
  instanceId: string
  reason: string
  sentAt: number
  stack?: string
}

const vrmViewUpdateRuntimeInstanceId = Math.random().toString(36).slice(2, 10)
let vrmViewUpdateMessageSequence = 0

export const useModelStore = defineStore('modelStore', () => {
  const { post, data } = useBroadcastChannel<BroadcastChannelEvents, BroadcastChannelEvents>({ name: 'airi-stores-stage-ui-three-vrm' })
  const shouldUpdateViewHooks = ref(new Set<() => void>())

  const onShouldUpdateView = (hook: () => void) => {
    shouldUpdateViewHooks.value.add(hook)
    return () => {
      shouldUpdateViewHooks.value.delete(hook)
    }
  }

  function shouldUpdateView(reason = 'unknown') {
    const event: BroadcastChannelEventShouldUpdateView = {
      type: 'vrm-should-update-view',
      href: typeof window !== 'undefined' ? window.location.href : 'unknown',
      instanceId: `${vrmViewUpdateRuntimeInstanceId}:${++vrmViewUpdateMessageSequence}`,
      reason,
      sentAt: Date.now(),
      stack: new Error('[VRM shouldUpdateView]').stack,
    }

    post(event)
    shouldUpdateViewHooks.value.forEach(hook => hook())
  }

  watch(data, (event) => {
    if (event?.type === 'vrm-should-update-view') {
      shouldUpdateViewHooks.value.forEach(hook => hook())
    }
  })

  // === Scene runtime orchestration ===
  const scenePhase = ref<ScenePhase>('pending')
  const sceneTransactionDepth = ref(0)
  const sceneMutationLocked = computed(() => scenePhase.value !== 'mounted' || sceneTransactionDepth.value > 0)

  function setScenePhase(phase: ScenePhase) {
    scenePhase.value = phase
  }

  function beginSceneBindingTransaction() {
    sceneTransactionDepth.value += 1
  }

  function endSceneBindingTransaction() {
    sceneTransactionDepth.value = Math.max(0, sceneTransactionDepth.value - 1)
  }

  function resetSceneBindingTransactions() {
    sceneTransactionDepth.value = 0
  }

  // === Legacy / shared controls ===
  // REVIEW: `scale` is still shared with non-VRM view controls. The VRM path should
  // gradually move to `cameraDistance` as the primary user-facing zoom concept.
  const scale = useLocalStorage('settings/stage-ui-three/scale', 1)
  const lastCommittedModelSrc = useLocalStorage('settings/stage-ui-three/lastModelSrc', '')

  // === Model lifecycle / bootstrap ===
  // These values are recalculated from the currently bound model instance whenever
  // a new bootstrap payload is committed into the scene.
  const modelSize = useLocalStorage('settings/stage-ui-three/modelSize', { x: 0, y: 0, z: 0 })
  const modelOrigin = useLocalStorage('settings/stage-ui-three/modelOrigin', { x: 0, y: 0, z: 0 })
  const eyeHeight = useLocalStorage('settings/stage-ui-three/eyeHeight', 0)

  // === User scene settings ===
  // These values are intended to survive model reloads and direct edits from settings UI.
  const modelOffset = useLocalStorage('settings/stage-ui-three/modelOffset', { x: 0, y: 0, z: 0 })
  const modelRotationY = useLocalStorage('settings/stage-ui-three/modelRotationY', 0)
  const cameraFOV = useLocalStorage('settings/stage-ui-three/cameraFOV', 40)
  const trackingMode = useLocalStorage('settings/stage-ui-three/trackingMode', 'none' as 'camera' | 'mouse' | 'none')

  // === View state ===
  // `cameraDistance` is the user-facing distance control. `cameraPosition` and
  // `lookAtTarget` represent the current runtime pose and may be recalculated when
  // a new model bootstrap is applied.
  const cameraPosition = useLocalStorage('settings/stage-ui-three/camera-position', { x: 0, y: 0, z: -1 })
  const cameraDistance = useLocalStorage('settings/stage-ui-three/cameraDistance', 0)
  const lookAtTarget = useLocalStorage('settings/stage-ui-three/lookAtTarget', { x: 0, y: 0, z: 0 })

  function resetModelStore() {
    scenePhase.value = 'pending'
    sceneTransactionDepth.value = 0

    lastCommittedModelSrc.value = ''
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

  // === Environment / lighting / render settings ===
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

  // Rendering quality
  const renderScale = useLocalStorage('settings/stage-ui-three/renderScale', Math.min(window.devicePixelRatio, 2))
  const multisampling = useLocalStorage('settings/stage-ui-three/multisampling', 4)

  // environment related setting
  const envSelect = useLocalStorage('settings/stage-ui-three/envEnabled', 'hemisphere' as 'hemisphere' | 'skyBox')
  const skyBoxSrc = useLocalStorage('settings/stage-ui-three/skyBoxUrl', defaultSkyBoxSrc)
  const skyBoxIntensity = useLocalStorage('settings/stage-ui-three/skyBoxIntensity', 0.1)

  return {
    scenePhase,
    sceneTransactionDepth,
    sceneMutationLocked,

    scale,
    lastCommittedModelSrc,

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
    renderScale,
    multisampling,

    envSelect,
    skyBoxSrc,
    skyBoxIntensity,

    onShouldUpdateView,
    shouldUpdateView,
    setScenePhase,
    beginSceneBindingTransaction,
    endSceneBindingTransaction,
    resetSceneBindingTransactions,

    resetModelStore,
  }
})
