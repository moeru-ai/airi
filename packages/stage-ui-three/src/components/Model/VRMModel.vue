<script setup lang="ts">
/*
  * - Core component for loading and displaying VRM model
  * - Load model, get some geometry data for initialisation
  * - Shader injection and rendering setting
  * - Load & initialise animation
*/

import type { VRM } from '@pixiv/three-vrm'
import type {
  AnimationClip,
  AnimationMixer,
  Group,
  Material,
  Object3D,
  PerspectiveCamera,
  ShaderMaterial,
  SphericalHarmonics3,
  Texture,
  WebGLRenderer,
} from 'three'

import type { VrmMotionLibrary } from '../../assets/vrm/animations'
import type { AvatarAnimatorHooks } from '../../composables/vrm/avatar-animator'
import type {
  VrmDisposeHookContext,
  VrmFrameHookContext,
  VrmHook,
  VrmLoadHookContext,
  VrmMaterialHookContext,
} from '../../composables/vrm/hooks'
import type { VrmInteractionColliderSet } from '../../composables/vrm/interaction'
import type { SceneBootstrap, TrackingMode, Vec3 } from '../../stores/model-store'
import type { VrmLifecycleReason } from '../../trace'
import type { ManagedVrmInstance } from './vrm-instance-cache'

import { VRMUtils } from '@pixiv/three-vrm'
import { useLoop, useTresContext } from '@tresjs/core'
import { until } from '@vueuse/core'
import {
  Box3,
  MathUtils,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Raycaster,

  SRGBColorSpace,
  Vector3,
} from 'three'
import {
  computed,
  onMounted,
  onUnmounted,
  ref,

  shallowRef,

  toRef,
  toRefs,
  watch,

} from 'vue'

import { defaultVrmMotionLibrary, proceduralThinkingMotion } from '../../assets/vrm/animations'
import { useVRMEyeFocusFor } from '../../composables/eye-tracking'
import {
  createIblProbeController,
  injectDiffuseIBL,
  normalizeEnvMode,
  updateNprShaderSetting,
} from '../../composables/shader/ibl'
// From stage-ui-three package
import {
  clipFromVRMAnimation,
  loadVRMAnimation,
  reAnchorRootPositionTrack,
  useIdleEyeSaccades,
} from '../../composables/vrm/animation'
import { AvatarAnimator } from '../../composables/vrm/avatar-animator'
import { loadVrm } from '../../composables/vrm/core'
import { useVRMEmote } from '../../composables/vrm/expression'
import { createVrmInteractionColliders } from '../../composables/vrm/interaction'
import { resolveInternalVrmHooks } from '../../composables/vrm/internal-hooks'
import { useVRMLipSync } from '../../composables/vrm/lip-sync'
import { MoodFace } from '../../composables/vrm/mood-face'
import { PerformanceDirector } from '../../composables/vrm/performance-director'
import { createThinkingClip } from '../../composables/vrm/thinking-pose'
import {
  createThreeRendererMemorySnapshot,
  createVrmSceneSummarySnapshot,
  getStageThreeRuntimeTraceContext,
  isStageThreeRuntimeTraceEnabled,
  stageThreeTraceVrmDisposeEndEvent,
  stageThreeTraceVrmDisposeStartEvent,
  stageThreeTraceVrmLoadEndEvent,
  stageThreeTraceVrmLoadErrorEvent,
  stageThreeTraceVrmLoadStartEvent,
  stageThreeTraceVrmUpdateFrameEvent,
} from '../../trace'
import {
  clearManagedVrmInstance,
  stashManagedVrmInstance,
  takeManagedVrmInstance,
} from './vrm-instance-cache'

/*
  * Props:
  * - modelId: stable display model identity
  * - modelSrc: model src string to load model asset
  * - idleAnimation: animation src for model
  * - loadAnimations: TBC
  * - paused: if the animation is paused
  * - nprIrrSH: Spherical Harmonics computed from the sky box, used for IBL
  *
  * - modelOffset: The placing offset of model (x, y, z)
  * - modelRotationY: The rotation of the model (y-axis)
*/
const props = withDefaults(defineProps<{
  /** The context that creates the lip sync node. It must be the context of the played speech. */
  audioContext?: AudioContext
  /** Connects the lip sync node to the played speech and returns the disconnection. */
  connectSpeech?: (node: AudioNode) => () => void
  /** Whether speech is currently audible. Required when `connectSpeech` is set. */
  speechActive?: boolean
  /**
   * Whether the character waits for a reply. The head turns away while she thinks,
   * and the thinking clip of `motionLibrary` plays when one is set.
   */
  thinking?: boolean
  /** Idle pool, talking clip, and emotes. Defaults to the bundled Utsuwa motions. */
  motionLibrary?: VrmMotionLibrary
  cursorPosition?: { x: number, y: number }
  /** The stable identity of the last model that completed scene binding. */
  lastCommittedModelId?: string
  /** Stable display model identity. Runtime resource URLs can change across reloads. */
  modelId: string
  modelSrc?: string
  idleAnimation: string
  // loadAnimations?: string[]
  paused?: boolean

  envSelect: string
  skyBoxIntensity: number
  nprIrrSH?: SphericalHarmonics3 | null

  modelOffset: Vec3
  modelRotationY: number
  trackingMode: TrackingMode
  eyeHeight: number
  screenBoundingBox: () => { top: number, left: number, width: number, height: number }
  cameraPosition: Vec3

  camera: PerspectiveCamera
}>(), {
  paused: false,
  thinking: false,
  motionLibrary: () => defaultVrmMotionLibrary,
})
/*
  * Emits:
  * - model-core-loading-progress
  * - model-core-error
  * - model-core-ready
  *
*/
const emit = defineEmits<{
  (e: 'loadingProgress', value: number): void
  (e: 'loadStart', value: 'initial-load' | 'model-reload' | 'model-switch'): void
  (e: 'sceneBootstrap', value: SceneBootstrap): void

  (e: 'error', value: unknown): void
  (e: 'loaded', value: string): void
}>()

const {
  audioContext,
  connectSpeech,
  lastCommittedModelId,
  modelId,
  modelSrc,
  idleAnimation,
  // loadAnimations, // TBC
  paused,

  envSelect,
  skyBoxIntensity,
  nprIrrSH,

  modelOffset,
  modelRotationY,
  eyeHeight,

  camera,
} = toRefs(props)

// Model and scene ref
const { renderer, scene } = useTresContext()
const vrm = shallowRef<VRM>()
const vrmGroup = shallowRef<Group>()
/** Height of the loaded model in world units, measured when the scene is built. */
const modelHeight = shallowRef(0)
/** Scratch for {@link headAnchor}, so a rendered frame allocates nothing. */
const headPosition = new Vector3()
const headUp = new Vector3()
const modelLoaded = ref<boolean>(false)
const interactionColliders = shallowRef<VrmInteractionColliderSet>()

let loadSequence = 0
// for eye tracking modes
const raycaster = new Raycaster()

// Animation related ref
const vrmAnimationMixer = ref<AnimationMixer>()
const vrmAnimator = shallowRef<AvatarAnimator>()
const vrmDirector = shallowRef<PerformanceDirector>()
const vrmMoodFace = shallowRef<MoodFace>()
/** Mouth opening written by lip sync in the last frame, read by the director in the next one. */
let lastMouth = 0
let lastIdleUrl: string | null = null
const { onBeforeRender, stop, start } = useLoop()

const vrmHooks: readonly VrmHook[] = resolveInternalVrmHooks()
type VrmFrameRuntimeHook = (vrm: VRM, delta: number) => void
const vrmFrameRuntimeHook = shallowRef<VrmFrameRuntimeHook>()
let disposeBeforeRenderLoop: (() => void | undefined) | undefined

// material type with optional update function for per-frame update, used for three-vrm's MToon material and custom shader materials with IBL injection
type UpdatableMaterial = Material & {
  update?: (delta: number) => void
}

// Expressions
const idleEyeSaccades = useIdleEyeSaccades()
// shallowRef: the composable object must stay non-reactive, otherwise Vue
// deep-unwraps nested refs/computed (e.g. isEmoteActive) and breaks reads
// like vrmEmote.value.isEmoteActive.value in the render loop.
const vrmEmote = shallowRef<ReturnType<typeof useVRMEmote>>()
const vrmLipSync = useVRMLipSync(audioContext, connectSpeech, toRef(props, 'speechActive'))

// For sky box update
const nprProgramVersion = ref(0)
// For MToon IBL
let airiIblProbe: ReturnType<typeof createIblProbeController> | null = null
const stageThreeRuntimeTraceContext = getStageThreeRuntimeTraceContext()

function measureFrameStep(enabled: boolean, fn: () => void) {
  if (!enabled) {
    fn()
    return 0
  }

  const startedAt = performance.now()
  fn()
  return performance.now() - startedAt
}

function getRendererInstance() {
  return renderer?.instance as WebGLRenderer | undefined
}

function updateIblProbe(mode = normalizeEnvMode(envSelect.value)) {
  if (!airiIblProbe && scene.value)
    airiIblProbe = createIblProbeController(scene.value)

  airiIblProbe?.update(mode, skyBoxIntensity.value, nprIrrSH.value ?? null)
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error)
    return error.message
  if (typeof error === 'string')
    return error

  try {
    return JSON.stringify(error)
  }
  catch {
    return String(error)
  }
}

function emitVrmLoadError(reason: VrmLifecycleReason, startedAt: number, error: unknown) {
  if (!isStageThreeRuntimeTraceEnabled())
    return

  stageThreeRuntimeTraceContext.emit(stageThreeTraceVrmLoadErrorEvent, {
    durationMs: performance.now() - startedAt,
    errorMessage: toErrorMessage(error),
    modelSrc: modelSrc.value,
    reason,
    rendererMemory: createThreeRendererMemorySnapshot(getRendererInstance()),
    sceneSummary: createVrmSceneSummarySnapshot({ mixer: vrmAnimationMixer.value, vrm: vrm.value }),
    ts: performance.now(),
  })
}

function invalidatePendingLoads() {
  loadSequence += 1
  return loadSequence
}

function isLoadRequestCurrent(requestId: number) {
  return loadSequence === requestId
}

function disposeDetachedVrm(detachedVrm?: VRM, detachedGroup?: Group) {
  detachedGroup?.removeFromParent()

  if (detachedVrm)
    VRMUtils.deepDispose(detachedVrm.scene as unknown as Object3D)
}

function detachVrmGroup(detachedGroup?: Group) {
  detachedGroup?.removeFromParent()
}

function createManagedVrmInstance(instance: Omit<ManagedVrmInstance, 'modelSrc' | 'scopeKey'>): ManagedVrmInstance {
  return {
    modelSrc: modelSrc.value!,
    scopeKey: getManagedVrmScopeKey(),
    ...instance,
  }
}

function getManagedVrmScopeKey() {
  return typeof window !== 'undefined' ? window.location.href : 'unknown'
}

function getActiveManagedVrmInstance() {
  if (!modelSrc.value || !vrm.value || !vrmGroup.value || !vrmAnimationMixer.value || !vrmEmote.value || !vrmAnimator.value || !vrmDirector.value || !vrmMoodFace.value)
    return undefined

  return createManagedVrmInstance({
    animator: vrmAnimator.value,
    director: vrmDirector.value,
    moodFace: vrmMoodFace.value,
    emote: vrmEmote.value,
    group: vrmGroup.value,
    interactionColliders: interactionColliders.value!,
    mixer: vrmAnimationMixer.value,
    vrm: vrm.value,
  })
}

function clearActiveManagedVrmRefs() {
  vrmAnimationMixer.value = undefined
  vrmAnimator.value = undefined
  vrmDirector.value = undefined
  vrmMoodFace.value = undefined
  vrmEmote.value = undefined
  vrm.value = undefined
  vrmGroup.value = undefined
  interactionColliders.value = undefined
}

function applyModelTransform(group: Group) {
  group.position.set(
    modelOffset.value.x,
    modelOffset.value.y,
    modelOffset.value.z,
  )
  group.rotation.y = MathUtils.degToRad(modelRotationY.value)
}

function applyManagedVrmInstance(instance: ManagedVrmInstance) {
  // A reload creates a new group while the saved transform can stay unchanged.
  // Apply it during every commit because the value watchers will not run again.
  applyModelTransform(instance.group)
  vrm.value = instance.vrm
  vrmGroup.value = instance.group
  vrmAnimationMixer.value = instance.mixer
  // A cached instance can come from an earlier mount. Its hooks must read the props
  // of this component.
  instance.animator.hooks = createAnimatorHooks(instance.vrm)
  vrmAnimator.value = instance.animator
  vrmDirector.value = instance.director
  vrmMoodFace.value = instance.moodFace
  vrmEmote.value = instance.emote
  interactionColliders.value = instance.interactionColliders
}

function destroyManagedVrmInstance(instance?: ManagedVrmInstance) {
  if (!instance)
    return

  instance.emote.dispose()
  instance.animator.dispose()
  instance.interactionColliders.dispose()
  disposeDetachedVrm(instance.vrm, instance.group)
}

function isManagedVrmInstanceReusable(instance: ManagedVrmInstance) {
  try {
    instance.group.updateMatrixWorld(true)
    instance.vrm.scene.updateMatrixWorld(true)
    instance.vrm.humanoid.update()
    return true
  }
  catch {
    return false
  }
}

function shouldDestroyVrmResources(reason: VrmLifecycleReason) {
  return reason === 'model-switch'
}

function shouldStashVrmResources(reason: VrmLifecycleReason) {
  return reason === 'component-unmount'
}

function updateManagedVrmMaterials(activeVrm: VRM | undefined, delta: number) {
  // NOTICE: three-vrm drives MToon per-frame uniforms, including alphaTest used by MASK cutout,
  // through material.update(delta). Our render loop updates VRM subsystems manually instead of
  // calling vrm.update(delta), so material updates must be forwarded here as well.
  activeVrm?.materials?.forEach((material) => {
    (material as UpdatableMaterial).update?.(delta)
  })
}

function runVrmLoadHooks(context: VrmLoadHookContext) {
  for (const hook of vrmHooks) {
    hook.onLoad?.(context)
  }
}

function runVrmMaterialHooks(context: VrmMaterialHookContext) {
  for (const hook of vrmHooks) {
    hook.onMaterial?.(context)
  }
}

function runVrmFrameHooks(context: VrmFrameHookContext) {
  for (const hook of vrmHooks) {
    try {
      hook.onFrame?.(context)
    }
    catch (error) {
      console.error(error)
      emit('error', error)
    }
  }
}

function runVrmFrameRuntimeHook(vrm: VRM, delta: number) {
  try {
    vrmFrameRuntimeHook.value?.(vrm, delta)
  }
  catch (error) {
    console.error(error)
    emit('error', error)
  }
}

function runVrmDisposeHooks(context: VrmDisposeHookContext) {
  for (const hook of vrmHooks) {
    try {
      hook.onDispose?.(context)
    }
    catch (error) {
      console.error(error)
      emit('error', error)
    }
  }
}

function runVrmDisposeHooksForInstance(instance: ManagedVrmInstance | undefined, reason: VrmLifecycleReason) {
  if (!instance)
    return

  runVrmDisposeHooks({
    camera: camera.value,
    reason,
    vrm: instance.vrm,
    vrmGroup: instance.group,
  })
}

function destroyManagedVrmInstanceWithHooks(instance: ManagedVrmInstance | undefined, reason: VrmLifecycleReason) {
  if (!instance)
    return

  runVrmDisposeHooksForInstance(instance, reason)
  destroyManagedVrmInstance(instance)
}

/** Clip cache per model, so the idle pool and emotes parse and retarget each file once. */
const clipCache = new WeakMap<VRM, Map<string, Promise<AnimationClip>>>()

function clipCacheOf(targetVrm: VRM) {
  let byUrl = clipCache.get(targetVrm)
  if (!byUrl) {
    byUrl = new Map()
    clipCache.set(targetVrm, byUrl)
  }
  return byUrl
}

/**
 * Loads a motion of the library. Library clips play with the hips track that
 * `createVRMAnimationClip` produces, as in Utsuwa.
 *
 * NOTICE:
 * `reAnchorRootPositionTrack` moves the first frame of the hips to the rest pose.
 * Clips that start in another stance, like the greeting bow, then lift the whole
 * body when she stands up. Only the stage idle (`idleAnimation`) is re-anchored,
 * once, at load time with the rig in rest pose, and seeded into this cache.
 * Source: `composables/vrm/animation.ts`, comment of `reAnchorRootPositionTrack`.
 * Removal condition: the stage idle needs no re-anchor, or all clips share its root space.
 */
function loadMotionClip(targetVrm: VRM, url: string): Promise<AnimationClip> {
  const byUrl = clipCacheOf(targetVrm)
  const cached = byUrl.get(url)
  if (cached)
    return cached

  const loading = (async () => {
    // The thinking stance is built from the stage idle, so she keeps breathing while she thinks.
    if (url === proceduralThinkingMotion)
      return createThinkingClip(targetVrm, await loadMotionClip(targetVrm, idleAnimation.value))
    const animation = await loadVRMAnimation(url)
    const clip = await clipFromVRMAnimation(targetVrm, animation)
    if (!clip)
      throw new Error(`No VRM animation in ${url}`)
    return clip
  })()
  // A failed load is removed, so a later request can try again.
  loading.catch(() => byUrl.delete(url))
  byUrl.set(url, loading)
  return loading
}

/** Idle candidates: the idle of the stage settings first, then the bundled pool. */
function idleCandidates() {
  return [...new Set([idleAnimation.value, ...props.motionLibrary.idles].filter(Boolean))]
}

function createAnimatorHooks(targetVrm: VRM): AvatarAnimatorHooks {
  return {
    loadClip: url => loadMotionClip(targetVrm, url),
    pickIdleUrl: () => {
      const urls = idleCandidates()
      // Never the same idle twice in a row, when there is a choice.
      const choices = urls.length > 1 ? urls.filter(url => url !== lastIdleUrl) : urls
      lastIdleUrl = choices[Math.floor(Math.random() * choices.length)] ?? null
      return lastIdleUrl
    },
    isTalking: () => props.speechActive === true,
    isThinking: () => props.thinking === true,
  }
}

function bindManagedVrmInstanceRenderLoop() {
  disposeBeforeRenderLoop?.()

  disposeBeforeRenderLoop = onBeforeRender(({ delta }) => {
    // Manually update VRM components in the render loop because we manage the render loop on our own.
    // See:
    // 1. https://github.com/pixiv/three-vrm/blob/2c4aac612467216e0c8e7dc4500c2fa309208cc7/packages/three-vrm-core/src/VRMCore.ts#L72-L82
    // 2. https://github.com/pixiv/three-vrm/blob/2c4aac612467216e0c8e7dc4500c2fa309208cc7/packages/three-vrm/src/VRM.ts#L49-L67
    const traceStart = isStageThreeRuntimeTraceEnabled() ? performance.now() : 0
    const tracingEnabled = traceStart > 0

    const activeVrm = vrm.value
    const activeVrmGroup = vrmGroup.value
    const director = vrmDirector.value
    // The director undoes its offsets of the last frame before the mixer writes the
    // new pose. Bones without an animation track would otherwise keep adding up.
    if (activeVrm && director)
      director.restore(activeVrm)
    const animationMixerMs = measureFrameStep(tracingEnabled, () => {
      if (vrmAnimator.value)
        vrmAnimator.value.update(delta)
      else
        vrmAnimationMixer.value?.update(delta)
    })
    const moodFace = vrmMoodFace.value
    if (activeVrm && director) {
      const events = director.apply(activeVrm, delta, {
        speaking: props.speechActive === true,
        thinking: props.thinking === true,
        mouth: lastMouth,
      })
      // Beats of the xiaoke director: an expression on a speech beat, a micro expression
      // while idle, and an earlier idle switch right after speech or thinking.
      if (events.speakBeat)
        moodFace?.react(moodFace.moodName ?? 'relaxed', 0.4)
      if (events.idleBeat)
        moodFace?.react(moodFace.moodName ?? 'relaxed', 0.25)
      if (events.nudgeIdleAfterSeconds !== null)
        vrmAnimator.value?.requestIdleSwitch(events.nudgeIdleAfterSeconds)
    }
    updateManagedVrmMaterials(activeVrm, delta)
    const vrmFrameHookMs = measureFrameStep(tracingEnabled, () => {
      if (activeVrm && activeVrmGroup) {
        runVrmFrameHooks({
          camera: camera.value,
          delta,
          vrm: activeVrm,
          vrmGroup: activeVrmGroup,
        })
      }
    })
    const vrmRuntimeHookMs = measureFrameStep(tracingEnabled, () => {
      if (activeVrm)
        runVrmFrameRuntimeHook(activeVrm, delta)
    })
    const humanoidMs = measureFrameStep(tracingEnabled, () => {
      activeVrm?.humanoid.update()
    })
    const lookAtMs = measureFrameStep(tracingEnabled, () => {
      activeVrm?.lookAt?.update?.(delta)
    })
    const blinkAndSaccadeMs = measureFrameStep(tracingEnabled, () => {
      // Mood, reactions, blink, and the emote face, as in Utsuwa. The blink stops and the
      // face turns happy while a body emote plays.
      if (!activeVrm?.expressionManager || !moodFace)
        return
      const face = moodFace.update({
        deltaSeconds: delta,
        speaking: props.speechActive === true,
        emotePlaying: vrmAnimator.value?.emotePlaying ?? false,
      })
      for (const [name, weight] of face)
        activeVrm.expressionManager.setValue(name, weight)
    })
    const lipSyncMs = measureFrameStep(tracingEnabled, () => {
      vrmLipSync.update(activeVrm, delta)
    })
    // Read after lipSyncMs, not before: vrmLipSync.update() is what flips
    // this flag for the current frame. Reading it earlier in the frame would
    // hand the emote a stale value from the previous frame, letting it
    // overwrite the mouth morph lip sync just wrote on the first frame of an
    // utterance.
    const isLipSyncActive = vrmLipSync.isLipSyncActive?.value ?? false
    const emoteMs = measureFrameStep(tracingEnabled, () => {
      // Runs after lip sync: while speech is active the emote yields viseme
      // mouth morphs (skipVisemes), and once lip sync falls silent the emote
      // re-asserts its mouth targets over lip sync's zeroed weights. The
      // state machine keeps advancing either way, so emotion transitions and
      // the reset timeout stay in sync during long utterances.
      vrmEmote.value?.update(delta, { skipVisemes: isLipSyncActive })
    })
    const expressionMs = measureFrameStep(tracingEnabled, () => {
      activeVrm?.expressionManager?.update()
    })
    lastMouth = activeVrm ? PerformanceDirector.mouthOf(activeVrm) : 0
    const nodeConstraintMs = measureFrameStep(tracingEnabled, () => {
      activeVrm?.nodeConstraintManager?.update()
    })
    const springBoneMs = measureFrameStep(tracingEnabled, () => {
      activeVrm?.springBoneManager?.update(delta)
    })

    if (traceStart > 0) {
      stageThreeRuntimeTraceContext.emit(stageThreeTraceVrmUpdateFrameEvent, {
        animationMixerMs,
        blinkAndSaccadeMs,
        deltaMs: delta * 1000,
        durationMs: performance.now() - traceStart,
        emoteMs,
        expressionMs,
        humanoidMs,
        lipSyncMs,
        lookAtMs,
        nodeConstraintMs,
        springBoneMs,
        ts: traceStart,
        vrmFrameHookMs,
        vrmRuntimeHookMs,
      })
    }
  }).off
}

function commitManagedVrmInstance(
  instance: ManagedVrmInstance,
  reason: 'initial-load' | 'model-reload' | 'model-switch',
) {
  // Keep the active model visible until its replacement is ready. No asynchronous
  // work occurs between this cleanup and the replacement scene commit.
  if (reason !== 'initial-load')
    componentCleanUp(reason, { invalidate: false })

  updateIblProbe()
  scene.value?.add(instance.group)
  applyManagedVrmInstance(instance)
  bindManagedVrmInstanceRenderLoop()
  emit('loaded', modelSrc.value!)
  modelLoaded.value = true
}

// clean the previous vrm model loaded
function componentCleanUp(
  reason: VrmLifecycleReason,
  options: { invalidate?: boolean } = {},
) {
  const { invalidate = true } = options
  if (invalidate)
    invalidatePendingLoads()

  const startedAt = performance.now()
  const activeInstance = getActiveManagedVrmInstance()
  const shouldDestroyResources = shouldDestroyVrmResources(reason)
  const clearedInstance = shouldDestroyResources ? clearManagedVrmInstance(getManagedVrmScopeKey()) : undefined
  const rendererInstance = getRendererInstance()
  const hasCleanupWork = !!disposeBeforeRenderLoop
    || !!activeInstance
    || !!airiIblProbe

  if (hasCleanupWork && isStageThreeRuntimeTraceEnabled()) {
    stageThreeRuntimeTraceContext.emit(stageThreeTraceVrmDisposeStartEvent, {
      modelSrc: modelSrc.value,
      reason,
      rendererMemory: createThreeRendererMemorySnapshot(rendererInstance),
      sceneSummary: createVrmSceneSummarySnapshot({ mixer: activeInstance?.mixer, vrm: activeInstance?.vrm }),
      ts: startedAt,
    })
  }

  disposeBeforeRenderLoop?.()
  disposeBeforeRenderLoop = undefined

  if (activeInstance)
    detachVrmGroup(activeInstance.group)

  if (shouldDestroyResources) {
    destroyManagedVrmInstanceWithHooks(activeInstance, reason)
    destroyManagedVrmInstanceWithHooks(clearedInstance, reason)
  }
  else if (shouldStashVrmResources(reason)) {
    destroyManagedVrmInstanceWithHooks(activeInstance ? stashManagedVrmInstance(activeInstance) : undefined, reason)
  }
  else {
    destroyManagedVrmInstanceWithHooks(activeInstance, reason)
  }

  airiIblProbe?.dispose()
  airiIblProbe = null
  clearActiveManagedVrmRefs()
  modelLoaded.value = false

  if (hasCleanupWork && isStageThreeRuntimeTraceEnabled()) {
    stageThreeRuntimeTraceContext.emit(stageThreeTraceVrmDisposeEndEvent, {
      durationMs: performance.now() - startedAt,
      modelSrc: modelSrc.value,
      reason,
      rendererMemory: createThreeRendererMemorySnapshot(rendererInstance),
      sceneSummary: createVrmSceneSummarySnapshot(),
      ts: performance.now(),
    })
  }
}

const defaultTookAt = computed(() => new Vector3(0, eyeHeight.value, -100))

function computeBoundingBox(vrmScene: Object3D) {
  const box = new Box3()
  const childBox = new Box3()

  vrmScene.updateMatrixWorld(true)

  vrmScene.traverse((obj) => {
    if (!obj.visible)
      return

    const mesh = obj as Mesh
    if (!mesh.isMesh || !mesh.geometry)
      return

    if (mesh.name.startsWith('VRMC_springBone_collider'))
      return

    if (!mesh.geometry.boundingBox)
      mesh.geometry.computeBoundingBox()

    childBox.copy(mesh.geometry.boundingBox!)
    childBox.applyMatrix4(mesh.matrixWorld)
    box.union(childBox)
  })

  return box
}

function getEyePosition(activeVrm: VRM): number | null {
  const eye = activeVrm.humanoid?.getNormalizedBoneNode('head')
  if (!eye)
    return null

  const eyePos = new Vector3()
  eye.getWorldPosition(eyePos)
  return eyePos.y
}

function buildSceneBootstrap(activeVrm: VRM, cacheHit: boolean): SceneBootstrap {
  const bootstrapRoot = activeVrm.scene.parent ?? activeVrm.scene
  const box = computeBoundingBox(bootstrapRoot)
  const modelSize = new Vector3()
  const modelCenter = new Vector3()
  box.getSize(modelSize)
  box.getCenter(modelCenter)
  modelHeight.value = modelSize.y
  modelCenter.y += modelSize.y / 5

  const fov = camera.value?.fov ?? 40
  const radians = (fov / 2 * Math.PI) / 180
  const initialCameraOffset = new Vector3(
    modelSize.x / 16,
    modelSize.y / 8,
    -(modelSize.y / 3) / Math.tan(radians),
  )

  const eyePositionY = getEyePosition(activeVrm) ?? modelCenter.y
  const cameraPosition = modelCenter.clone().add(initialCameraOffset)

  return {
    cacheHit,
    cameraDistance: cameraPosition.distanceTo(modelCenter),
    cameraPosition: { x: cameraPosition.x, y: cameraPosition.y, z: cameraPosition.z },
    eyeHeight: eyePositionY,
    lookAtTarget: defaultTookAt.value,
    modelOffset: {
      x: bootstrapRoot.position.x,
      y: bootstrapRoot.position.y,
      z: bootstrapRoot.position.z,
    },
    modelOrigin: { x: modelCenter.x, y: modelCenter.y, z: modelCenter.z },
    modelSize: { x: modelSize.x, y: modelSize.y, z: modelSize.z },
  }
}

function resolveVrmLoadReason(): 'initial-load' | 'model-reload' | 'model-switch' {
  if (!lastCommittedModelId.value)
    return 'initial-load'

  if (lastCommittedModelId.value !== modelId.value)
    return 'model-switch'

  return 'model-reload'
}

async function loadModel() {
  const requestId = invalidatePendingLoads()
  const currentLoadReason = resolveVrmLoadReason()
  const loadStartedAt = performance.now()
  let nextVrm: VRM | undefined
  let nextVrmGroup: Group | undefined
  let nextVrmAnimationMixer: AnimationMixer | undefined
  let nextVrmAnimator: AvatarAnimator | undefined
  let nextVrmEmote: ReturnType<typeof useVRMEmote> | undefined
  let didCommitLoad = false

  try {
    if (!scene.value) {
      await until(() => scene.value).toBeTruthy()
      if (!isLoadRequestCurrent(requestId))
        return
    }
    if (!modelSrc.value) {
      console.warn('NO model src, cannot load VRM model.')
      return
    }

    emit('loadStart', currentLoadReason)

    if (isStageThreeRuntimeTraceEnabled()) {
      stageThreeRuntimeTraceContext.emit(stageThreeTraceVrmLoadStartEvent, {
        modelSrc: modelSrc.value,
        reason: currentLoadReason,
        rendererMemory: createThreeRendererMemorySnapshot(getRendererInstance()),
        sceneSummary: createVrmSceneSummarySnapshot(),
        ts: loadStartedAt,
      })
    }

    modelLoaded.value = false
    const reusableInstance = takeManagedVrmInstance(getManagedVrmScopeKey(), modelSrc.value)
    if (reusableInstance) {
      if (!isManagedVrmInstanceReusable(reusableInstance)) {
        destroyManagedVrmInstanceWithHooks(reusableInstance, currentLoadReason)
      }
      else {
        if (!isLoadRequestCurrent(requestId)) {
          destroyManagedVrmInstanceWithHooks(stashManagedVrmInstance(reusableInstance), currentLoadReason)
          return
        }

        nextVrm = reusableInstance.vrm
        nextVrmGroup = reusableInstance.group
        nextVrmAnimationMixer = reusableInstance.mixer
        nextVrmEmote = reusableInstance.emote

        runVrmLoadHooks({
          cacheHit: true,
          camera: camera.value,
          reason: currentLoadReason,
          vrm: reusableInstance.vrm,
          vrmGroup: reusableInstance.group,
        })
        emit('sceneBootstrap', buildSceneBootstrap(reusableInstance.vrm, true))
        commitManagedVrmInstance(reusableInstance, currentLoadReason)
        didCommitLoad = true

        if (isStageThreeRuntimeTraceEnabled()) {
          stageThreeRuntimeTraceContext.emit(stageThreeTraceVrmLoadEndEvent, {
            durationMs: performance.now() - loadStartedAt,
            modelSrc: modelSrc.value,
            reason: currentLoadReason,
            rendererMemory: createThreeRendererMemorySnapshot(getRendererInstance()),
            sceneSummary: createVrmSceneSummarySnapshot({ mixer: reusableInstance.mixer, vrm: reusableInstance.vrm }),
            ts: performance.now(),
          })
        }
        return
      }
    }

    const _vrmInfo = await loadVrm(modelSrc.value, {
      lookAt: true,
      onProgress: progress => emit(
        'loadingProgress',
        Number((100 * progress.loaded / progress.total).toFixed(2)),
      ),
    })
    if (!_vrmInfo || !_vrmInfo._vrm || !_vrmInfo._vrmGroup) {
      if (isLoadRequestCurrent(requestId)) {
        emitVrmLoadError(currentLoadReason, loadStartedAt, 'VRM model loading failure')
        console.warn('VRM model loading failure!')
        emit('error', new Error('VRM model loading failure'))
      }
      return
    }
    const {
      _vrm,
      _vrmGroup,
    } = _vrmInfo
    nextVrm = _vrm
    nextVrmGroup = _vrmGroup

    if (!isLoadRequestCurrent(requestId)) {
      disposeDetachedVrm(nextVrm, nextVrmGroup)
      return
    }

    runVrmLoadHooks({
      cacheHit: false,
      camera: camera.value,
      reason: currentLoadReason,
      vrm: _vrm,
      vrmGroup: _vrmGroup,
    })

    /*
      * Animation setting
    */
    const animation = await loadVRMAnimation(idleAnimation.value)
    const clip = await clipFromVRMAnimation(_vrm, animation)
    if (!isLoadRequestCurrent(requestId)) {
      disposeDetachedVrm(nextVrm, nextVrmGroup)
      return
    }
    if (!clip) {
      disposeDetachedVrm(nextVrm, nextVrmGroup)
      emitVrmLoadError(currentLoadReason, loadStartedAt, 'No VRM animation loaded')
      console.warn('No VRM animation loaded')
      if (isLoadRequestCurrent(requestId))
        emit('error', new Error('No VRM animation loaded'))
      return
    }
    // Re-anchor the root position track to the model origin
    reAnchorRootPositionTrack(clip, _vrm)

    // The re-anchored stage idle goes into the clip cache, so the idle pool reuses it
    // instead of re-anchoring it later in an animated pose.
    clipCacheOf(_vrm).set(idleAnimation.value, Promise.resolve(clip))

    // Play the first idle now. The animator cycles the idle pool from here on.
    nextVrmAnimator = new AvatarAnimator(_vrm.scene, createAnimatorHooks(_vrm))
    nextVrmAnimator.start(clip, props.motionLibrary.talking)
    nextVrmAnimationMixer = nextVrmAnimator.mixer
    lastIdleUrl = idleAnimation.value

    nextVrmEmote = useVRMEmote(_vrm)

    /*
      * Shader setting
    */
    const isShaderMat = (m: any): m is ShaderMaterial => !!m?.isShaderMaterial

    function configureInjectedShaderMaterial(mat: ShaderMaterial) {
      if ('toneMapped' in mat)
        mat.toneMapped = false
      if ('envMap' in mat && mat.envMap)
        mat.envMap = null

      // NPR materials usually use sRGB textures.
      const tex = (mat as any).map as Texture | undefined
      if (tex && (tex as any).colorSpace !== undefined) {
        try {
          (tex as any).colorSpace = SRGBColorSpace
        }
        catch (e) {
          console.warn('Failed to set colorSpace on texture:', e)
        }
      }

      injectDiffuseIBL(mat)
    }

    // Material traverse setting
    _vrm.scene.traverse((child) => {
      if (child instanceof Mesh && child.material) {
        const material = Array.isArray(child.material) ? child.material : [child.material]
        material.forEach((mat, materialIndex) => {
          if (mat instanceof MeshStandardMaterial || mat instanceof MeshPhysicalMaterial) {
            // Should read envMap intensity from outside props
            mat.envMapIntensity = 1.0
            mat.needsUpdate = true
          }
          else if (mat?.isMToonMaterial) {
            // --- MToon material ---
            // NOTICE: three-vrm MToon already consumes scene LightProbe irradiance.
            // Keep it on a single IBL path to avoid double-applying diffuse IBL.
            if ('toneMapped' in mat)
              mat.toneMapped = false
          }
          else if (isShaderMat(mat)) {
            // --- Shader material, further IBL injection needed ---
            // TODO: stylised shader injection
            // Lilia: I plan to replace all injected shader code to be my own, so that it can always avoid double injection and unknown user upload VRM injected shader behaviour...
            configureInjectedShaderMaterial(mat)
          }

          runVrmMaterialHooks({
            camera: camera.value,
            material: mat,
            materialIndex,
            mesh: child,
            reason: currentLoadReason,
            vrm: _vrm,
            vrmGroup: _vrmGroup,
          })
        })
      }
    })

    emit('sceneBootstrap', buildSceneBootstrap(_vrm, false))

    const nextInteractionColliders = createVrmInteractionColliders(_vrm)

    commitManagedVrmInstance(createManagedVrmInstance({
      animator: nextVrmAnimator,
      director: new PerformanceDirector(),
      moodFace: new MoodFace(Object.keys(_vrm.expressionManager?.expressionMap ?? {})),
      emote: nextVrmEmote,
      group: _vrmGroup,
      interactionColliders: nextInteractionColliders,
      mixer: nextVrmAnimationMixer,
      vrm: _vrm,
    }), currentLoadReason)
    didCommitLoad = true

    if (isStageThreeRuntimeTraceEnabled()) {
      stageThreeRuntimeTraceContext.emit(stageThreeTraceVrmLoadEndEvent, {
        durationMs: performance.now() - loadStartedAt,
        modelSrc: modelSrc.value,
        reason: currentLoadReason,
        rendererMemory: createThreeRendererMemorySnapshot(getRendererInstance()),
        sceneSummary: createVrmSceneSummarySnapshot({ mixer: vrmAnimationMixer.value, vrm: _vrm }),
        ts: performance.now(),
      })
    }
  }
  catch (err) {
    if (!didCommitLoad) {
      if (nextVrm && nextVrmGroup) {
        runVrmDisposeHooks({
          camera: camera.value,
          reason: currentLoadReason,
          vrm: nextVrm,
          vrmGroup: nextVrmGroup,
        })
      }

      nextVrmEmote?.dispose()
      if (nextVrmAnimator)
        nextVrmAnimator.dispose()
      else
        nextVrmAnimationMixer?.stopAllAction()
      disposeDetachedVrm(nextVrm, nextVrmGroup)
    }
    if (!isLoadRequestCurrent(requestId))
      return

    emitVrmLoadError(currentLoadReason, loadStartedAt, err)
    console.error(err)
    emit('error', err)
  }
}

const focusPos = useVRMEyeFocusFor({
  cameraPosition: () => props.cameraPosition,
  context: () => ({
    camera: camera.value,
    raycaster,
    defaultLookAt: defaultTookAt.value,
  }),
  screenBoundingBox: props.screenBoundingBox,
  source: () => props.cursorPosition,
  trackingMode: () => props.trackingMode,
})

onMounted(async () => {
  // watch if the model needs to be reloaded
  // Registered BEFORE the initial load to avoid missing src changes
  // that arrive while the first loadModel() is still in-flight.
  watch(modelSrc, (newSrc, oldSrc) => {
    if (newSrc !== oldSrc) {
      loadModel()
    }
  })

  // wait until scene is not undefined
  await until(() => scene.value).toBeTruthy()
  await loadModel()

  // Speech and waiting drive the talking and thinking clips of the animator.
  watch(() => props.speechActive === true, (speaking) => {
    vrmAnimator.value?.setTalking(speaking)
  })
  watch(() => props.thinking === true && props.speechActive !== true, (thinking) => {
    const animator = vrmAnimator.value
    if (!animator)
      return
    if (thinking && props.motionLibrary.thinking)
      animator.startThinking(props.motionLibrary.thinking)
    else
      animator.stopThinking(props.speechActive !== true)
  })

  /*
    * Downward info flow
    * - Pinia store value updated => command take effect
  */
  // watch if the animation should be paused
  watch(paused, (isPaused) => {
    if (isPaused) {
      stop()
    }
    else {
      start()
    }
  }, { immediate: true })
  // update model position
  watch(modelOffset, () => {
    if (vrmGroup.value)
      applyModelTransform(vrmGroup.value)
  }, { immediate: true, deep: true })
  // update model rotation
  watch(modelRotationY, () => {
    if (vrmGroup.value)
      applyModelTransform(vrmGroup.value)
  }, { immediate: true })
  // update NPR sky box
  watch([envSelect, skyBoxIntensity, nprIrrSH], async () => {
    if (!vrm.value)
      return
    // force the program to flush
    nprProgramVersion.value += 1
    const mode = normalizeEnvMode(envSelect.value)

    // TODO: after bumping up to three 0.180.0 with @types/three 0.180.0,
    //   Argument of type 'Group<Object3DEventMap>' is not assignable to parameter of type 'Object3D<Object3DEventMap>'.
    //     Type 'Group<Object3DEventMap>' is missing the following properties from type 'Object3D<Object3DEventMap>': setPointerCapture, releasePointerCapture, hasPointerCapture
    //
    // Currently, AFAIK, https://github.com/pmndrs/xr/blob/456aa380206e93888cd3a5741a1534e672ae3106/packages/pointer-events/src/pointer.ts#L69-L100 declares
    // declare module 'three' {
    //   interface Object3D {
    //     setPointerCapture(pointerId: number): void
    //     releasePointerCapture(pointerId: number): void
    //     hasPointerCapture(pointerId: number): boolean

    //     intersectChildren?: boolean
    //     interactableDescendants?: Array<Object3D>
    //     /**
    //      * @deprecated
    //      */
    //     ancestorsHaveListeners?: boolean
    //     ancestorsHavePointerListeners?: boolean
    //     ancestorsHaveWheelListeners?: boolean
    //   }
    // }
    //
    // And in @tresjs/core v5, it uses the @pmndrs/pointer-events internally.
    // Somehow the Object3D from @types/three and the one augmented by @pmndrs/pointer-events are not compatible.
    // This needs to be fixed later.
    updateNprShaderSetting(vrm.value?.scene as unknown as Object3D, {
      mode,
      intensity: skyBoxIntensity.value,
      sh: nprIrrSH.value ?? null,
    })
    updateIblProbe(mode)
  }, { immediate: true })
  watch(focusPos, (newPos) => {
    idleEyeSaccades.instantUpdate(vrm.value, newPos)
  }, { immediate: true })
})

onUnmounted(() => {
  componentCleanUp('component-unmount')
})

if (import.meta.hot) {
  // Ensure cleanup on HMR
  import.meta.hot.dispose(() => {
    componentCleanUp('manual-reload')
  })
}

/**
 * The head's reach as a share of the model's height.
 *
 * A VRM describes a humanoid, and a humanoid's head is a stable fraction of its
 * height, so this holds across models without measuring any of them. It only has
 * to be close: a caller uses it to stand clear of the head, not to trace it.
 */
const headReachPerModelHeight = 1 / 14

/**
 * Where the head is in world space, and how far it reaches.
 *
 * The position comes from the rig, so it turns and nods with the head and needs
 * no measuring. The reach is a share of the model's height, because nothing in
 * the format states the head's size, and the alternatives all assume something
 * about how the model was built.
 *
 * A radius rather than a box: the head turns, and a caller placing something
 * beside it needs a clearance that does not change as it does.
 *
 * The returned position is scratch, rewritten by the next call. This runs on
 * every rendered frame the bubble is visible, and a caller reads it before
 * asking again; one that keeps it must copy it.
 */
function headAnchor() {
  const activeVrm = vrm.value
  const head = activeVrm?.humanoid?.getNormalizedBoneNode('head')
  if (!head || modelHeight.value <= 0)
    return undefined

  const radius = modelHeight.value * headReachPerModelHeight

  head.getWorldPosition(headPosition)

  // The bone sits at the base of the skull, so the drawn head is above it. The
  // offset follows the bone's own up axis rather than the world's, which keeps
  // it correct while the head is tilted.
  headUp.setFromMatrixColumn(head.matrixWorld, 1).normalize()
  headPosition.addScaledVector(headUp, radius)

  return { position: headPosition, radius }
}

defineExpose({
  headAnchor,
  getInteractionColliders: () => interactionColliders.value?.colliders ?? [],
  /** Sets the mood: a reaction first, then a resting face that stays until the next mood. */
  setExpression(expression: string, intensity = 1) {
    vrmMoodFace.value?.setMood(expression, intensity)
    if (intensity > 0)
      vrmMoodFace.value?.react(expression)
  },
  /** Shows a short reaction, for example to a touch. The resting mood does not change. */
  reactExpression(expression: string, intensity = 1) {
    if (intensity > 0)
      vrmMoodFace.value?.react(expression)
  },
  /** Emotes of the motion library, for the LLM prompt and the settings page. */
  motions: () => props.motionLibrary.emotes,
  /**
   * Plays an emote of the motion library once, then returns to the idle.
   * Resolves `false` when the id is unknown or the clip cannot load.
   */
  async playMotion(id: string): Promise<boolean> {
    const emote = props.motionLibrary.emotes.find(entry => entry.id === id)
    const targetVrm = vrm.value
    const animator = vrmAnimator.value
    if (!emote || !targetVrm || !animator)
      return false
    try {
      const clip = await loadMotionClip(targetVrm, emote.url)
      // The model can change while the clip loads.
      if (vrm.value !== targetVrm || vrmAnimator.value !== animator)
        return false
      animator.playEmote(clip)
      return true
    }
    catch (error) {
      console.error(`[vrm] motion "${id}" failed to load:`, error)
      return false
    }
  },
  // NOTICE: This runtime frame hook is intentionally separate from internal VRM model hooks.
  // External callers use it for live pose/tracking input; internal hooks remain reserved for
  // stage-ui-three's own model/material lifecycle extensions.
  setVrmFrameHook(hook?: VrmFrameRuntimeHook) {
    vrmFrameRuntimeHook.value = hook
  },
  scene: computed(() => vrm.value?.scene),
  lookAtUpdate(target: Vec3) {
    idleEyeSaccades.instantUpdate(vrm.value, target)
  },
})
</script>

<template>
  <slot v-if="modelLoaded" />
</template>
