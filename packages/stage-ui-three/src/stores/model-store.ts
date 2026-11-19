import type { Vector3 } from 'three'

import { useModelScopedLocalStorage } from '@proj-airi/stage-shared/composables'
import { useBroadcastChannel, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import defaultSkyBoxSrc from '../components/Environment/assets/sky_linekotsi_23_HDRI.hdr?url'

import { DEFAULT_CAMERA_POSITION, useThreeCamera } from './camera'
import { supportedControl, useThreeViewControl } from './view-control'

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
const { modelOffset, set: setViewControl } = useThreeViewControl()
const { cameraDistance, cameraFOV, cameraPosition } = useThreeCamera()

const modelRotationY = useModelScopedLocalStorage('three', 'settings/stage-ui-three/modelRotationY', 0)
const trackingMode = useModelScopedLocalStorage<TrackingMode>('three', 'settings/stage-ui-three/trackingMode', 'none')
const maxFps = useLocalStorage('settings/stage-ui-three/max-fps', 0)

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

  // === Model identity ===
  // The display model ID is stable across application restarts. Runtime URLs are not.
  // This is the model in the scene now. It decides if a load replaces another model, so it
  // is one value for the renderer and not a setting of a model.
  const lastCommittedModelId = useLocalStorage('settings/stage-ui-three/last-committed-model-id', '')
  /**
   * The model that owns the stored view of the active model settings.
   *
   * It is empty until the first load of a model stores a view. The unscoped key held the
   * model of the stored view in releases before per-model settings.
   */
  const savedViewModelId = useModelScopedLocalStorage('three', 'settings/stage-ui-three/lastModelId', '')
  /** The storage key from releases that used runtime URLs as model identity. */
  const legacyLastCommittedModelSrcStorageKey = 'settings/stage-ui-three/lastModelSrc'

  /**
   * Clears model identity from releases that stored only a runtime URL.
   *
   * A regenerated Blob URL cannot identify the persisted file that owns the saved view.
   * The first VRM load after this reset establishes the stable model ID for later starts.
   */
  function resetLegacyModelIdentity() {
    const legacyModelSrc = window.localStorage.getItem(legacyLastCommittedModelSrcStorageKey)
    if (!legacyModelSrc)
      return

    lastCommittedModelId.value = ''
    savedViewModelId.value = ''
    window.localStorage.removeItem(legacyLastCommittedModelSrcStorageKey)
  }

  // === Model lifecycle / bootstrap ===
  // These values are recalculated from the currently bound model instance whenever
  // a new bootstrap payload is committed into the scene.
  const modelSize = useModelScopedLocalStorage('three', 'settings/stage-ui-three/modelSize', { x: 0, y: 0, z: 0 })
  const modelOrigin = useModelScopedLocalStorage('three', 'settings/stage-ui-three/modelOrigin', { x: 0, y: 0, z: 0 })
  const eyeHeight = useModelScopedLocalStorage('three', 'settings/stage-ui-three/eyeHeight', 0)

  // === View state ===
  /** current runtime pose. may be recalculated when a new model bootstrap is applied. */
  const lookAtTarget = useModelScopedLocalStorage('three', 'settings/stage-ui-three/lookAtTarget', { x: 0, y: 0, z: 0 })

  function resetModelStore() {
    scenePhase.value = 'pending'
    sceneTransactionDepth.value = 0

    lastCommittedModelId.value = ''
    savedViewModelId.value = ''
    window.localStorage.removeItem(legacyLastCommittedModelSrcStorageKey)
    modelSize.value = { x: 0, y: 0, z: 0 }
    modelOrigin.value = { x: 0, y: 0, z: 0 }
    modelRotationY.value = 0

    cameraPosition.value = { ...DEFAULT_CAMERA_POSITION }
    supportedControl.forEach(c => setViewControl(c))

    lookAtTarget.value = { x: 0, y: 0, z: 0 }
    trackingMode.value = 'none'
    eyeHeight.value = 0
  }

  // === Environment / lighting / render settings ===
  const directionalLightPosition = useModelScopedLocalStorage('three', 'settings/stage-ui-three/scenes/scene/directional-light/position', { x: 0, y: 0, z: -1 })
  const directionalLightTarget = useModelScopedLocalStorage('three', 'settings/stage-ui-three/scenes/scene/directional-light/target', { x: 0, y: 0, z: 0 })
  const directionalLightRotation = useModelScopedLocalStorage('three', 'settings/stage-ui-three/scenes/scene/directional-light/rotation', { x: 0, y: 0, z: 0 })
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
  const directionalLightIntensity = useModelScopedLocalStorage('three', 'settings/stage-ui-three/scenes/scene/directional-light/intensity', 2.02)
  // TODO: color are the same
  const directionalLightColor = useModelScopedLocalStorage('three', 'settings/stage-ui-three/scenes/scene/directional-light/color', '#fffbf5')

  const hemisphereSkyColor = useModelScopedLocalStorage('three', 'settings/stage-ui-three/scenes/scene/hemisphere-light/sky-color', '#FFFFFF')
  const hemisphereGroundColor = useModelScopedLocalStorage('three', 'settings/stage-ui-three/scenes/scene/hemisphere-light/ground-color', '#222222')
  const hemisphereLightIntensity = useModelScopedLocalStorage('three', 'settings/stage-ui-three/scenes/scene/hemisphere-light/intensity', 0.4)

  const ambientLightColor = useModelScopedLocalStorage('three', 'settings/stage-ui-three/scenes/scene/ambient-light/color', '#FFFFFF')
  const ambientLightIntensity = useModelScopedLocalStorage('three', 'settings/stage-ui-three/scenes/scene/ambient-light/intensity', 0.6)

  // Rendering quality
  const renderScale = useLocalStorage('settings/stage-ui-three/renderScale', Math.min(window.devicePixelRatio, 2))
  const multisampling = useLocalStorage('settings/stage-ui-three/multisampling', 4)

  // environment related setting
  const envSelect = useModelScopedLocalStorage('three', 'settings/stage-ui-three/envEnabled', 'hemisphere' as 'hemisphere' | 'skyBox')
  const skyBoxSrc = useModelScopedLocalStorage('three', 'settings/stage-ui-three/skyBoxUrl', defaultSkyBoxSrc)
  const skyBoxIntensity = useModelScopedLocalStorage('three', 'settings/stage-ui-three/skyBoxIntensity', 0.1)

  return {
    scenePhase,
    sceneTransactionDepth,
    sceneMutationLocked,

    lastCommittedModelId,
    savedViewModelId,

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
    maxFps,
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
    resetLegacyModelIdentity,

    resetModelStore,
  }
})
