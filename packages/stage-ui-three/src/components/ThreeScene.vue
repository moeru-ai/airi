<script setup lang="ts">
/*
  * - Root vue component of stage-ui-three package
  * - This scene component the root for all the sub components in the 3d scene
  * - This package, stage-ui-three, is a stateful package
  * - Pinia store is used to store the data/configuration of the model, camera, lighting, etc.
  * - Src of model is obtained from stage-ui via props, which is NOT a part of stage-ui-three package
*/

import type { VRM } from '@pixiv/three-vrm'
import type { TresContext } from '@tresjs/core'
import type { DirectionalLight, SphericalHarmonics3, Texture, WebGLRenderer, WebGLRenderTarget } from 'three'

import type { SceneBootstrap, ScenePhase, Vec3 } from '../stores/model-store'
import type { VrmLifecycleReason } from '../trace'

import { Screen } from '@proj-airi/ui'
import { TresCanvas } from '@tresjs/core'
import { EffectComposerPmndrs, HueSaturationPmndrs } from '@tresjs/post-processing'
import { formatHex } from 'culori'
import { storeToRefs } from 'pinia'
import { BlendFunction } from 'postprocessing'
import {
  ACESFilmicToneMapping,
  Euler,
  MathUtils,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

// From stage-ui-three package
import { useRenderTargetRegionAtClientPoint } from '../composables/render-target'
// pinia store
import { useModelStore } from '../stores/model-store'
import {
  getStageThreeRuntimeTraceContext,
  isStageThreeRuntimeTraceEnabled,
  stageThreeTraceRenderInfoEvent,
  stageThreeTraceThreeSceneComponentStateEvent,
  stageThreeTraceThreeSceneMutationLockEvent,
  stageThreeTraceThreeScenePhaseEvent,
  stageThreeTraceThreeSceneSubtreeEvent,
  stageThreeTraceThreeSceneTransactionEvent,
} from '../trace'
import { OrbitControls } from './Controls'
import { SkyBox } from './Environment'
import { VRMModel } from './Model'

const props = withDefaults(defineProps<{
  currentAudioSource?: AudioBufferSourceNode
  modelSrc?: string
  skyBoxSrc?: string
  showAxes?: boolean
  idleAnimation?: string
  paused?: boolean
}>(), {
  showAxes: false,
  idleAnimation: new URL('../assets/vrm/animations/idle_loop.vrma', import.meta.url).href,
  paused: false,
})

const emit = defineEmits<{
  (e: 'loadModelProgress', value: number): void
  (e: 'error', value: unknown): void
}>()

type ModelPhase = 'no-model' | 'loading' | 'ready' | 'error'
type SceneTracePhaseCause
  = | 'binding:complete'
    | 'binding:start'
    | 'component:unmount'
    | 'controls-ready'
    | 'controls-ref:detached'
    | 'model-ref:detached'
    | 'props:model-src'
    | 'tres:ready'
    | 'vrm:error'
    | 'vrm:load-start'
    | 'vrm:loaded'
type SceneTraceTransactionReason = 'component-unmount' | 'initial-load' | 'model-reload' | 'model-switch' | 'no-model' | 'subtree-remount' | 'unknown'

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const modelStore = useModelStore()
const {
  beginSceneBindingTransaction,
  endSceneBindingTransaction,
  resetSceneBindingTransactions,
  setScenePhase,
} = modelStore
const {
  sceneMutationLocked,
  scenePhase,
  sceneTransactionDepth,

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
  envSelect,
  skyBoxSrc,
  skyBoxIntensity,
  renderScale,
  multisampling,
} = storeToRefs(modelStore)

type VrmFrameRuntimeHook = (vrm: VRM, delta: number) => void

const modelRef = ref<InstanceType<typeof VRMModel>>()
const vrmFrameRuntimeHook = shallowRef<VrmFrameRuntimeHook>()

const camera = shallowRef(new PerspectiveCamera())
const controlsRef = shallowRef<InstanceType<typeof OrbitControls>>()
const tresCanvasRef = shallowRef<TresContext>()
const skyBoxEnvRef = ref<InstanceType<typeof SkyBox>>()
const dirLightRef = ref<InstanceType<typeof DirectionalLight>>()
const stageThreeRuntimeTraceContext = getStageThreeRuntimeTraceContext()
const stageThreeSceneTraceOriginId = `three-scene:${Math.random().toString(36).slice(2, 10)}`
const latestScenePhaseTraceCause = ref<SceneTracePhaseCause>('props:model-src')
const latestSceneTransactionReason = ref<SceneTraceTransactionReason>('unknown')
const activeModelSrc = ref<string>()
const bindingRevision = ref(0)
const pendingCommittedModelSrc = ref<string>()
const pendingCommittedModelRevision = ref<number>()
const pendingSceneBootstrap = shallowRef<SceneBootstrap>()

function emitThreeSceneTrace(label: string, event: any, payload: Record<string, unknown>) {
  if (isStageThreeRuntimeTraceEnabled())
    stageThreeRuntimeTraceContext.emit(event, payload)
  if (import.meta.env.DEV)
    console.info(`[stage-ui-three][trace][three-scene][${label}]`, payload)
}

function emitScenePhaseTrace(cause: SceneTracePhaseCause, from: ScenePhase | undefined, to: ScenePhase) {
  emitThreeSceneTrace('phase', stageThreeTraceThreeScenePhaseEvent, {
    cause,
    from,
    modelSrc: props.modelSrc,
    originId: stageThreeSceneTraceOriginId,
    to,
    transactionDepth: sceneTransactionDepth.value,
    ts: performance.now(),
  })
}

function emitSceneSubtreeTrace(key: 'controlsRef' | 'dirLightRef' | 'modelRef' | 'tresCanvasRef', action: 'attached' | 'detached') {
  emitThreeSceneTrace('subtree', stageThreeTraceThreeSceneSubtreeEvent, {
    action,
    key,
    originId: stageThreeSceneTraceOriginId,
    scenePhase: scenePhase.value,
    transactionDepth: sceneTransactionDepth.value,
    ts: performance.now(),
  })
}

function emitSceneTransactionTrace(action: 'begin' | 'end' | 'reset', reason: SceneTraceTransactionReason) {
  emitThreeSceneTrace('transaction', stageThreeTraceThreeSceneTransactionEvent, {
    action,
    depth: sceneTransactionDepth.value,
    originId: stageThreeSceneTraceOriginId,
    reason,
    scenePhase: scenePhase.value,
    ts: performance.now(),
  })
}

function emitSceneMutationLockTrace(locked: boolean) {
  emitThreeSceneTrace('mutation-lock', stageThreeTraceThreeSceneMutationLockEvent, {
    locked,
    originId: stageThreeSceneTraceOriginId,
    scenePhase: scenePhase.value,
    transactionDepth: sceneTransactionDepth.value,
    ts: performance.now(),
  })
}

function emitSceneComponentStateTrace(
  from: 'pending' | 'loading' | 'mounted' | undefined,
  to: 'pending' | 'loading' | 'mounted',
  diagnostics: {
    canvasReady: boolean
    controlsReady: boolean
    modelPhase: ModelPhase
  },
) {
  emitThreeSceneTrace('component-state', stageThreeTraceThreeSceneComponentStateEvent, {
    canvasReady: diagnostics.canvasReady,
    controlsReady: diagnostics.controlsReady,
    from,
    modelPhase: diagnostics.modelPhase,
    originId: stageThreeSceneTraceOriginId,
    scenePhase: scenePhase.value,
    to,
    transactionDepth: sceneTransactionDepth.value,
    ts: performance.now(),
  })
}
function toVector3(value: Vec3) {
  return new Vector3(value.x, value.y, value.z)
}

function toVec3(value: Vector3): Vec3 {
  return { x: value.x, y: value.y, z: value.z }
}

function clearPendingCommittedModel() {
  pendingCommittedModelSrc.value = undefined
  pendingCommittedModelRevision.value = undefined
}

function invalidateBindingRevision() {
  bindingRevision.value += 1
  clearPendingCommittedModel()
}

function applySceneBootstrap(value: SceneBootstrap) {
  const reason = latestSceneTransactionReason.value
  const previousOrigin = toVector3(modelOrigin.value)
  const previousCameraOffset = toVector3(cameraPosition.value).sub(previousOrigin)
  const previousTargetOffset = toVector3(lookAtTarget.value).sub(previousOrigin)
  const nextOrigin = toVector3(value.modelOrigin)
  const bootstrapCameraOffset = toVector3(value.cameraPosition).sub(nextOrigin)

  modelOrigin.value = { ...value.modelOrigin }
  modelSize.value = { ...value.modelSize }
  eyeHeight.value = value.eyeHeight

  if (reason === 'initial-load' || reason === 'unknown' || reason === 'no-model' || reason === 'model-switch') {
    modelOffset.value = { ...value.modelOffset }
    cameraDistance.value = value.cameraDistance
    cameraPosition.value = { ...value.cameraPosition }
    lookAtTarget.value = { ...value.lookAtTarget }
    return
  }

  const effectiveCameraDistance = cameraDistance.value > 1e-6 ? cameraDistance.value : value.cameraDistance
  cameraDistance.value = effectiveCameraDistance

  const nextCameraDirection = previousCameraOffset.lengthSq() > 1e-6
    ? previousCameraOffset.normalize()
    : bootstrapCameraOffset.lengthSq() > 1e-6
      ? bootstrapCameraOffset.normalize()
      : new Vector3(0, 0, -1)

  cameraPosition.value = toVec3(nextOrigin.clone().addScaledVector(nextCameraDirection, effectiveCameraDistance))

  if (previousTargetOffset.lengthSq() > 1e-6) {
    lookAtTarget.value = toVec3(nextOrigin.clone().add(previousTargetOffset))
    return
  }

  lookAtTarget.value = { ...value.lookAtTarget }
}

const { readRenderTargetRegionAtClientPoint, disposeRenderTarget } = useRenderTargetRegionAtClientPoint({
  getRenderer: () => tresCanvasRef.value?.renderer.instance as WebGLRenderer | undefined,
  getScene: () => tresCanvasRef.value?.scene.value,
  getCamera: () => camera.value,
  getCanvas: () => tresCanvasRef.value?.renderer.instance.domElement,
})

/*
  * Pinia store definition
  * - Lilia: We highly recommend you gather all the store data definition here
  * - Only this root component (ThreeScene) can directly access pinia store
*/
// TODO: remove the hard-coded pinia store and inject the data from here

/*
  * Handle upward info flow
  * - Sub components emit info => update pinia store
*/
// === OrbitControls ===
// Get camera update => update camera info in pinia
function onOrbitControlsCameraChanged(value: {
  newCameraPosition: Vec3
  newCameraDistance: number
}) {
  const posChanged = Math.abs(cameraPosition.value.x - value.newCameraPosition.x) > 1e-6
    || Math.abs(cameraPosition.value.y - value.newCameraPosition.y) > 1e-6
    || Math.abs(cameraPosition.value.z - value.newCameraPosition.z) > 1e-6
  if (posChanged) {
    cameraPosition.value = value.newCameraPosition
  }
  const distChanged = Math.abs(cameraDistance.value - value.newCameraDistance) > 1e-6
  if (distChanged) {
    cameraDistance.value = value.newCameraDistance
  }
}
const controlsReady = ref(false)
const isCompletingBinding = ref(false)

//  === VRMModel ===
const canvasReady = ref(false)
const modelPhase = ref<ModelPhase>(props.modelSrc ? 'loading' : 'no-model')

function beginSceneBindingCycle(reason: SceneTraceTransactionReason) {
  latestSceneTransactionReason.value = reason
  invalidateBindingRevision()
  resetSceneBindingTransactions()
  emitSceneTransactionTrace('reset', reason)
  beginSceneBindingTransaction()
  emitSceneTransactionTrace('begin', reason)
  setScenePhaseWithTrace('loading', 'vrm:load-start')
}

function beginSceneRebind(reason: SceneTraceTransactionReason = 'subtree-remount') {
  latestSceneTransactionReason.value = reason
  invalidateBindingRevision()

  if (sceneTransactionDepth.value === 0) {
    beginSceneBindingTransaction()
    emitSceneTransactionTrace('begin', reason)
  }

  setScenePhaseWithTrace('loading', 'controls-ref:detached')
}

function setScenePhaseWithTrace(phase: ScenePhase, cause: SceneTracePhaseCause) {
  latestScenePhaseTraceCause.value = cause
  setScenePhase(phase)
}

function commitLastCommittedModelSrc(expectedRevision: number, nextPhase: ScenePhase) {
  if (nextPhase !== 'mounted')
    return

  if (expectedRevision !== bindingRevision.value)
    return

  if (!pendingCommittedModelSrc.value || pendingCommittedModelRevision.value !== expectedRevision)
    return

  if (!activeModelSrc.value || pendingCommittedModelSrc.value !== activeModelSrc.value)
    return

  if (props.modelSrc !== activeModelSrc.value)
    return

  lastCommittedModelSrc.value = pendingCommittedModelSrc.value
  clearPendingCommittedModel()
}

function toSceneLoadTransactionReason(reason: VrmLifecycleReason): SceneTraceTransactionReason {
  switch (reason) {
    case 'initial-load':
    case 'model-reload':
    case 'model-switch':
      return reason
    default:
      return 'unknown'
  }
}

function resolveScenePhaseAfterBinding(): ScenePhase {
  if (!canvasReady.value)
    return 'pending'

  if (!props.modelSrc)
    return 'no-model'

  if (modelPhase.value === 'error')
    return 'error'

  if (modelPhase.value === 'ready')
    return 'mounted'

  return 'loading'
}

async function completeSceneBinding(expectedRevision = bindingRevision.value) {
  if (isCompletingBinding.value)
    return
  isCompletingBinding.value = true

  try {
    setScenePhaseWithTrace('binding', 'binding:start')

    if (pendingSceneBootstrap.value) {
      applySceneBootstrap(pendingSceneBootstrap.value)
      pendingSceneBootstrap.value = undefined
    }

    await nextTick()

    if (expectedRevision !== bindingRevision.value)
      return

    controlsRef.value?.update()

    if (sceneTransactionDepth.value > 0) {
      endSceneBindingTransaction()
      emitSceneTransactionTrace('end', latestSceneTransactionReason.value)
    }

    const nextPhase = resolveScenePhaseAfterBinding()
    setScenePhaseWithTrace(nextPhase, 'binding:complete')
    commitLastCommittedModelSrc(expectedRevision, nextPhase)
  }
  finally {
    isCompletingBinding.value = false
  }
}

function onOrbitControlsReady() {
  controlsReady.value = true

  if (modelPhase.value === 'ready' && scenePhase.value !== 'mounted')
    void completeSceneBinding()
}

const controlEnable = computed(() => {
  return controlsReady.value
    && modelPhase.value === 'ready'
    && scenePhase.value === 'mounted'
    && sceneTransactionDepth.value === 0
})
function onVRMModelLoadStart(reason: VrmLifecycleReason) {
  modelPhase.value = 'loading'
  pendingSceneBootstrap.value = undefined
  beginSceneBindingCycle(toSceneLoadTransactionReason(reason))
}

function onVRMSceneBootstrap(value: SceneBootstrap) {
  pendingSceneBootstrap.value = value
}

function onVRMModelLookAtTarget(value: Vec3) {
  lookAtTarget.value.x = value.x
  lookAtTarget.value.y = value.y
  lookAtTarget.value.z = value.z
}
function onVRMModelLoaded(value: string) {
  activeModelSrc.value = value
  pendingCommittedModelSrc.value = value
  pendingCommittedModelRevision.value = bindingRevision.value
  modelPhase.value = 'ready'
  void completeSceneBinding(bindingRevision.value)
}
function onVRMModelError(error: unknown) {
  invalidateBindingRevision()
  pendingSceneBootstrap.value = undefined
  modelPhase.value = props.modelSrc ? 'error' : 'no-model'
  resetSceneBindingTransactions()
  emitSceneTransactionTrace('reset', 'unknown')
  setScenePhaseWithTrace(props.modelSrc ? 'error' : 'no-model', 'vrm:error')
  emit('error', error)
}

// === sky box ===
const irrSHTex = ref<SphericalHarmonics3 | null>(null)
// Update irrSH for IBL
function onSkyBoxReady(EnvPayload: {
  hdri?: Texture | null
  pmrem?: WebGLRenderTarget | null
  irrSH: SphericalHarmonics3 | null
}) {
  irrSHTex.value = EnvPayload.irrSH || null
}

// === Tres Canvas ===
function onTresReady(context: TresContext) {
  tresCanvasRef.value = context
  canvasReady.value = true
  emitSceneSubtreeTrace('tresCanvasRef', 'attached')
  setScenePhaseWithTrace(resolveScenePhaseAfterBinding(), 'tres:ready')
}

function onTresRender() {
  if (!isStageThreeRuntimeTraceEnabled())
    return

  const renderer = tresCanvasRef.value?.renderer.instance
  if (!renderer)
    return

  stageThreeRuntimeTraceContext.emit(stageThreeTraceRenderInfoEvent, {
    drawCalls: renderer.info.render.calls,
    geometries: renderer.info.memory.geometries,
    lines: renderer.info.render.lines,
    points: renderer.info.render.points,
    textures: renderer.info.memory.textures,
    ts: performance.now(),
    triangles: renderer.info.render.triangles,
  })
}

onMounted(() => {
  if (envSelect.value === 'skyBox') {
    skyBoxEnvRef.value?.reload(skyBoxSrc.value)
  }
})

onUnmounted(() => {
  invalidateBindingRevision()
  if (tresCanvasRef.value)
    emitSceneSubtreeTrace('tresCanvasRef', 'detached')

  canvasReady.value = false
  tresCanvasRef.value = undefined
  activeModelSrc.value = undefined
  pendingSceneBootstrap.value = undefined
  resetSceneBindingTransactions()
  emitSceneTransactionTrace('reset', 'component-unmount')
  setScenePhaseWithTrace('pending', 'component:unmount')
  disposeRenderTarget()
})

const effectProps = {
  saturation: 0.3,
  hue: 0,
  blendFunction: BlendFunction.SRC,
}

function applyVrmFrameRuntimeHook() {
  modelRef.value?.setVrmFrameHook(vrmFrameRuntimeHook.value)
}

watch(() => props.modelSrc, (modelSrc) => {
  modelPhase.value = modelSrc ? 'loading' : 'no-model'

  if (!modelSrc) {
    invalidateBindingRevision()
    activeModelSrc.value = undefined
    pendingSceneBootstrap.value = undefined
    resetSceneBindingTransactions()
    emitSceneTransactionTrace('reset', 'no-model')
  }

  setScenePhaseWithTrace(resolveScenePhaseAfterBinding(), 'props:model-src')
}, { immediate: true })

watch(modelRef, (next, prev) => {
  if (!prev && next)
    emitSceneSubtreeTrace('modelRef', 'attached')

  if (next)
    applyVrmFrameRuntimeHook()

  if (prev && !next) {
    emitSceneSubtreeTrace('modelRef', 'detached')
    modelPhase.value = props.modelSrc ? 'loading' : 'no-model'
    setScenePhaseWithTrace(props.modelSrc ? 'loading' : 'no-model', 'model-ref:detached')
  }
}, { flush: 'sync' })

watch(controlsRef, (next, prev) => {
  if (!prev && next)
    emitSceneSubtreeTrace('controlsRef', 'attached')

  if (prev && !next) {
    emitSceneSubtreeTrace('controlsRef', 'detached')
    controlsReady.value = false

    if (props.modelSrc && !!activeModelSrc.value)
      beginSceneRebind()
  }
}, { flush: 'sync' })

watch(dirLightRef, (next, prev) => {
  if (!prev && next)
    emitSceneSubtreeTrace('dirLightRef', 'attached')

  if (prev && !next)
    emitSceneSubtreeTrace('dirLightRef', 'detached')
}, { flush: 'sync' })

// === Directional Light ===
// Directional light setup moved inline, no ready event needed
watch(
  [modelPhase, dirLightRef],
  ([phase, dirLight]) => {
    if (phase !== 'ready' || !dirLight)
      return

    try {
      // setup initial target of directional light
      dirLight.parent?.add(dirLight.target)
      dirLight.target.position.set(
        directionalLightTarget.value.x,
        directionalLightTarget.value.y,
        directionalLightTarget.value.z,
      )
      dirLight.target.updateMatrixWorld()
    }
    catch (error) {
      console.error('[ThreeScene] Failed to setup directional light:', error)
    }
  },
  { immediate: true },
)

watch(scenePhase, (to, from) => {
  emitScenePhaseTrace(latestScenePhaseTraceCause.value, from, to)
}, { immediate: true })

watch(sceneMutationLocked, (locked) => {
  emitSceneMutationLockTrace(locked)
}, { immediate: true })

const resolvedComponentState = computed<'pending' | 'loading' | 'mounted'>(() => {
  if (scenePhase.value === 'pending')
    return 'pending'

  if (scenePhase.value === 'loading' || scenePhase.value === 'binding')
    return 'loading'

  return 'mounted'
})

watch(resolvedComponentState, (to, from) => {
  componentState.value = to
  emitSceneComponentStateTrace(from, to, {
    canvasReady: canvasReady.value,
    controlsReady: controlsReady.value,
    modelPhase: modelPhase.value,
  })
}, { immediate: true })

function updateDirLightTarget(newRotation: { x: number, y: number, z: number }) {
  const light = dirLightRef.value
  if (!light)
    return

  const { x: rx, y: ry, z: rz } = newRotation
  const lightPosition = new Vector3(
    directionalLightPosition.value.x,
    directionalLightPosition.value.y,
    directionalLightPosition.value.z,
  )
  const origin = new Vector3(0, 0, 0)
  const euler = new Euler(
    MathUtils.degToRad(rx),
    MathUtils.degToRad(ry),
    MathUtils.degToRad(rz),
    'XYZ',
  )
  const initialForward = origin.clone().sub(lightPosition).normalize()
  const newForward = initialForward.applyEuler(euler).normalize()
  const distance = lightPosition.distanceTo(origin)
  const target = lightPosition.clone().addScaledVector(newForward, distance)

  light.target.position.copy(target)

  light.target.updateMatrixWorld()

  directionalLightTarget.value = { x: target.x, y: target.y, z: target.z }
}

watch(directionalLightRotation, (newRotation) => {
  updateDirLightTarget(newRotation)
}, { deep: true })

defineExpose({
  setExpression: (expression: string, intensity = 1) => {
    modelRef.value?.setExpression(expression, intensity)
  },
  // NOTICE: External runtime hooks are intentionally separate from internal VRM model hooks.
  // This public frame hook is reserved for live pose/tracking input and is forwarded to VRMModel
  // without exposing the internal model/material lifecycle hook pipeline.
  setVrmFrameHook: (hook?: VrmFrameRuntimeHook) => {
    vrmFrameRuntimeHook.value = hook
    applyVrmFrameRuntimeHook()
  },
  canvasElement: () => {
    return tresCanvasRef.value?.renderer.instance.domElement
  },
  camera: () => camera.value,
  renderer: () => tresCanvasRef.value?.renderer.instance,
  scene: () => modelRef.value?.scene,
  readRenderTargetRegionAtClientPoint,
})
</script>

<template>
  <Screen v-slot="{ width, height }">
    <TresCanvas
      :width="width"
      :height="height"
      :camera="camera"
      :antialias="true"
      :dpr="renderScale"
      :tone-mapping="ACESFilmicToneMapping"
      :tone-mapping-exposure="1"
      :clear-alpha="0"
      @ready="onTresReady"
      @render="onTresRender"
    >
      <OrbitControls
        ref="controlsRef"
        :control-enable="controlEnable"
        :model-size="modelSize"
        :camera-position="cameraPosition"
        :camera-target="modelOrigin"
        :camera-f-o-v="cameraFOV"
        :camera-distance="cameraDistance"
        @orbit-controls-camera-changed="onOrbitControlsCameraChanged"
        @orbit-controls-ready="onOrbitControlsReady"
      />
      <SkyBox
        v-if="envSelect === 'skyBox'"
        ref="skyBoxEnvRef"
        :sky-box-src="skyBoxSrc"
        :as-background="true"
        @sky-box-ready="onSkyBoxReady"
      />
      <TresHemisphereLight
        v-else
        :color="formatHex(hemisphereSkyColor)"
        :ground-color="formatHex(hemisphereGroundColor)"
        :position="[0, 1, 0]"
        :intensity="hemisphereLightIntensity"
        cast-shadow
      />
      <TresAmbientLight
        :color="formatHex(ambientLightColor)"
        :intensity="ambientLightIntensity"
        cast-shadow
      />
      <TresDirectionalLight
        ref="dirLightRef"
        :color="formatHex(directionalLightColor)"
        :position="[directionalLightPosition.x, directionalLightPosition.y, directionalLightPosition.z]"
        :intensity="directionalLightIntensity"
        cast-shadow
      />
      <Suspense>
        <EffectComposerPmndrs :multisampling="multisampling">
          <HueSaturationPmndrs v-bind="effectProps" />
        </EffectComposerPmndrs>
      </Suspense>
      <VRMModel
        ref="modelRef"
        :current-audio-source="props.currentAudioSource"
        :last-committed-model-src="lastCommittedModelSrc"
        :model-src="props.modelSrc"
        :idle-animation="props.idleAnimation"
        :paused="props.paused"
        :env-select="envSelect"
        :sky-box-intensity="skyBoxIntensity"
        :npr-irr-s-h="irrSHTex"
        :model-offset="modelOffset"
        :model-rotation-y="modelRotationY"
        :look-at-target="lookAtTarget"
        :tracking-mode="trackingMode"
        :eye-height="eyeHeight"
        :camera-position="cameraPosition"
        :camera="camera"
        @loading-progress="(val: number) => emit('loadModelProgress', val)"
        @load-start="onVRMModelLoadStart"
        @scene-bootstrap="onVRMSceneBootstrap"
        @look-at-target="onVRMModelLookAtTarget"
        @error="onVRMModelError"
        @loaded="onVRMModelLoaded"
      />
      <TresAxesHelper v-if="props.showAxes" :size="1" />
    </TresCanvas>
  </Screen>
</template>
