<script setup lang="ts">
/*
  * Root MMD scene component.
  *
  * Unlike the VRM renderer (which is declarative via TresJS), MMD is driven
  * imperatively: MMDAnimationHelper owns the animation/IK/grant/physics step
  * and must run in a hand-managed render loop. This component owns the
  * WebGLRenderer, camera, lights, OrbitControls, and the per-frame pipeline,
  * and exposes the same contract Stage.vue expects from every renderer
  * (canvasElement / captureFrame / setEmotion).
*/

import type { SkinnedMesh } from 'three'

import type { GazeOffset, MMDAnimationManager, MorphController } from '../../composables/mmd'
import type { ResolvedMMDModel } from '../../utils/mmd-loader'

import { errorMessageFrom } from '@moeru/std'
import { Screen } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import {
  AmbientLight,
  Box3,
  Clock,
  DirectionalLight,
  Group,
  Mesh,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three-stdlib'
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import {
  createGazeController,
  createMMDAnimationManager,
  createMMDLoaderContext,
  createMorphController,
  loadMMDAnimationClip,
  useMMDBlink,
  useMMDEmote,
  useMMDLipSync,
} from '../../composables/mmd'
import { Emotion, EMOTION_VALUES } from '../../constants/emotions'
import { useMMD } from '../../stores/mmd'
import { loadMMDModelFromSource } from '../../utils/mmd-loader'

const props = withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string
  paused?: boolean
  cursorPosition?: { x: number, y: number }
  currentAudioSource?: AudioBufferSourceNode
  enableOrbitControls?: boolean
}>(), {
  paused: false,
  enableOrbitControls: false,
})

const emit = defineEmits<{
  (e: 'error', err: unknown): void
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const mmdStore = useMMD()
const {
  physicsEnabled,
  ikEnabled,
  grantEnabled,
  gazeTrackingEnabled,
  position,
  scale,
  rotationY,
  morphOverrides,
  emotionActionMap,
  idleMotionName,
  availableMotions,
  oneShotAction,
} = storeToRefs(mmdStore)

const canvasRef = ref<HTMLCanvasElement>()

// Imperative three.js objects (no reactivity — mutated in the render loop).
let renderer: WebGLRenderer | undefined
let scene: Scene | undefined
let camera: PerspectiveCamera | undefined
let controls: OrbitControls | undefined
let modelGroup: Group | undefined
let resolved: ResolvedMMDModel | undefined
let mesh: SkinnedMesh | undefined
let morphs: MorphController | undefined
let animation: MMDAnimationManager | undefined
let emote: ReturnType<typeof useMMDEmote> | undefined
// Dedicated loader for VMD motions (no textures, so no URL modifier needed),
// plus the set of motion names already registered with the current model.
let animationLoader: ReturnType<typeof createMMDLoaderContext> | undefined
const registeredMotions = new Set<string>()
const clock = new Clock()
let rafHandle = 0

// Lip-sync owns Vue lifecycle hooks, so it must be created during setup. It
// is fed the live audio source and applied to whichever morphs are mounted.
const audioRef = shallowRef<AudioBufferSourceNode | undefined>(props.currentAudioSource)
watch(() => props.currentAudioSource, v => audioRef.value = v)
const lipSync = useMMDLipSync(audioRef)
const blink = useMMDBlink()
let gaze: ReturnType<typeof createGazeController> | undefined

function canvasElement() {
  return canvasRef.value
}

function captureFrame(): Promise<Blob | null> | undefined {
  if (!renderer || !scene || !camera)
    return undefined
  // preserveDrawingBuffer keeps the last frame readable for the snapshot.
  renderer.render(scene, camera)
  return new Promise(resolve => canvasRef.value?.toBlob(resolve, 'image/png'))
}

/** Converts a viewport cursor position into a normalized gaze offset. */
function gazeOffsetFromCursor(): GazeOffset | undefined {
  if (!gazeTrackingEnabled.value || !props.cursorPosition || !canvasRef.value)
    return undefined
  const rect = canvasRef.value.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0)
    return undefined
  const nx = ((props.cursorPosition.x - rect.left) / rect.width) * 2 - 1
  const ny = ((props.cursorPosition.y - rect.top) / rect.height) * 2 - 1
  return { x: Math.max(-1, Math.min(1, nx)), y: Math.max(-1, Math.min(1, ny)) }
}

function applyTransform() {
  if (!modelGroup)
    return
  modelGroup.scale.setScalar(scale.value)
  modelGroup.rotation.y = rotationY.value
  modelGroup.position.set(position.value.x, position.value.y, 0)
}

function setupScene() {
  const canvas = canvasRef.value!
  renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.outputColorSpace = SRGBColorSpace
  // MMD toon materials are not PBR/HDR; filmic tone mapping desaturates and
  // washes them out, so render their colors directly.
  renderer.toneMapping = NoToneMapping
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  scene = new Scene()
  camera = new PerspectiveCamera(30, 1, 0.1, 1000)
  camera.position.set(0, 1, 3)

  // Toon shading with an albedo self-glow (applied at load): keep direct lights
  // moderate so the lit side doesn't blow out, while the glow + ambient keep the
  // shadow side bright. The result is MMD's flat, luminous anime look.
  scene.add(new AmbientLight(0xFFFFFF, 0.6))
  const directional = new DirectionalLight(0xFFFBF5, 0.75)
  directional.position.set(1, 2, 2)
  scene.add(directional)

  controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.enabled = props.enableOrbitControls
}

/** Frames the camera so the whole model fits, and targets its mid-height. */
function frameCamera() {
  if (!camera || !controls || !modelGroup)
    return
  modelGroup.updateMatrixWorld(true)
  const box = new Box3().setFromObject(modelGroup)
  if (box.isEmpty())
    return
  const size = box.getSize(new Vector3())
  const center = box.getCenter(new Vector3())
  const fov = (camera.fov * Math.PI) / 180
  const distance = (Math.max(size.x, size.y) / (2 * Math.tan(fov / 2))) * 1.4
  camera.position.set(center.x, center.y, center.z + distance)
  camera.lookAt(center)
  controls.target.copy(center)
  controls.update()
}

function resize() {
  if (!renderer || !camera || !canvasRef.value)
    return
  const w = canvasRef.value.clientWidth
  const h = canvasRef.value.clientHeight
  if (w === 0 || h === 0)
    return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function renderLoop() {
  rafHandle = requestAnimationFrame(renderLoop)
  const delta = clock.getDelta()

  if (props.paused || !renderer || !scene || !camera)
    return

  if (animation) {
    // One imperative step: animation mixer → IK → grant → physics.
    animation.update(delta)
    // Apply AIRI-owned morphs after the helper so lip-sync/expression win
    // over any VMD mouth/expression keyframes.
    emote?.update(delta)
    blink.update(morphs, delta)
    lipSync.update(morphs, delta)
    // Gaze rotates eye/head bones, also after the helper.
    gaze?.update(gazeOffsetFromCursor(), delta)
  }

  controls?.update()
  renderer.render(scene, camera)
}

function disposeModel() {
  if (animation) {
    animation.dispose()
    animation = undefined
  }
  if (modelGroup && scene) {
    scene.remove(modelGroup)
    modelGroup.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.geometry?.dispose?.()
        const material = obj.material
        if (Array.isArray(material))
          material.forEach(m => m.dispose())
        else
          material?.dispose?.()
      }
    })
  }
  resolved?.dispose()
  registeredMotions.clear()
  animationLoader = undefined
  modelGroup = undefined
  mesh = undefined
  morphs = undefined
  emote = undefined
  gaze = undefined
  resolved = undefined
  mmdStore.isModelLoaded = false
}

/**
 * Loads and registers any imported VMD motions not yet bound to the current
 * model, then (re)applies the selected idle motion. Safe to call repeatedly;
 * already-registered motions are skipped.
 */
async function syncMotions() {
  if (!animation || !mesh)
    return

  for (const descriptor of availableMotions.value) {
    if (registeredMotions.has(descriptor.name))
      continue
    try {
      // The VMD file lives in IndexedDB (shared across windows); build a
      // window-local object URL to load it, then revoke it once parsed.
      const file = await mmdStore.getMotionFile(descriptor.id)
      if (!file) {
        console.warn(`[mmd] motion file "${descriptor.name}" (${descriptor.id}) not found in storage`)
        continue
      }
      const url = URL.createObjectURL(file)
      try {
        animationLoader ??= createMMDLoaderContext()
        const clip = await loadMMDAnimationClip(animationLoader.loader, url, mesh)
        animation.registerClip(descriptor.name, clip)
        registeredMotions.add(descriptor.name)
        if (clip.tracks.length === 0) {
          console.warn(
            `[mmd] motion "${descriptor.name}" loaded but has 0 tracks matching this model. `
            + 'The VMD\'s bone/morph names likely do not match the model (different rig/naming).',
          )
        }
        else {
          console.info(`[mmd] registered motion "${descriptor.name}" (${clip.tracks.length} tracks)`)
        }
      }
      finally {
        URL.revokeObjectURL(url)
      }
    }
    catch (err) {
      console.error('[mmd] failed to load motion', descriptor.name, errorMessageFrom(err))
      emit('error', err)
    }
  }

  if (idleMotionName.value && registeredMotions.has(idleMotionName.value))
    animation.setIdleMotion(idleMotionName.value)
}

async function loadModel(src: string) {
  if (!scene)
    return

  componentState.value = 'loading'
  disposeModel()

  try {
    resolved = await loadMMDModelFromSource(src)
    mesh = resolved.mesh

    modelGroup = new Group()
    modelGroup.add(mesh)
    applyTransform()
    scene.add(modelGroup)

    morphs = createMorphController(mesh, morphOverrides.value)
    mmdStore.availableMorphs = morphs.availableMorphs

    emote = useMMDEmote(morphs)
    gaze = createGazeController(mesh)

    animation = createMMDAnimationManager(mesh, { physicsEnabled: physicsEnabled.value })
    // No preset idle VMD ships yet; init with an empty clip so physics/IK run.
    await animation.init()
    animation.setIKEnabled(ikEnabled.value)
    animation.setGrantEnabled(grantEnabled.value)

    frameCamera()

    mmdStore.isModelLoaded = true
    componentState.value = 'mounted'

    // Bind any motions imported before this model mounted.
    await syncMotions()
  }
  catch (err) {
    componentState.value = 'pending'
    console.error('[mmd] failed to load model:', errorMessageFrom(err))
    emit('error', err)
  }
}

/** Plays the gesture motion mapped to an emotion, if the model has one. */
function setEmotion(emotion: string, intensity = 1) {
  const value = EMOTION_VALUES.includes(emotion as Emotion) ? emotion as Emotion : Emotion.Neutral
  emote?.setEmotion(value, intensity)

  const actionName = emotionActionMap.value[value]
  if (actionName)
    animation?.playAction(actionName, { loop: false })
}

let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  setupScene()
  resizeObserver = new ResizeObserver(() => resize())
  if (canvasRef.value)
    resizeObserver.observe(canvasRef.value)
  resize()
  clock.start()
  renderLoop()

  if (props.modelSrc)
    loadModel(props.modelSrc)
})

onUnmounted(() => {
  cancelAnimationFrame(rafHandle)
  resizeObserver?.disconnect()
  disposeModel()
  controls?.dispose()
  if (renderer) {
    renderer.dispose()
    renderer.forceContextLoss()
  }
  scene = undefined
  camera = undefined
  renderer = undefined
  controls = undefined
})

watch(() => props.modelSrc, (src) => {
  if (src)
    loadModel(src)
  else
    disposeModel()
})

watch(() => props.enableOrbitControls, (enabled) => {
  if (controls)
    controls.enabled = enabled
})

// View transform sliders.
watch([scale, rotationY, () => position.value.x, () => position.value.y], () => applyTransform())

// Solver/physics toggles.
watch(physicsEnabled, v => animation?.setPhysicsEnabled(v))
watch(ikEnabled, v => animation?.setIKEnabled(v))
watch(grantEnabled, v => animation?.setGrantEnabled(v))

// Morph-slot overrides: rebind each slot the user remapped.
watch(morphOverrides, (overrides) => {
  if (!morphs)
    return
  for (const [slot, name] of Object.entries(overrides)) {
    if (name)
      morphs.override(slot as Parameters<MorphController['override']>[0], name)
  }
}, { deep: true })

// One-shot motion requests from tools/the act bus.
watch(oneShotAction, (request) => {
  if (request)
    animation?.playAction(request.name, { loop: request.loop })
})

// Newly imported VMD motions: load and register them against the live model.
watch(availableMotions, () => {
  void syncMotions()
}, { deep: true })

// Idle-motion selection from the settings panel.
watch(idleMotionName, (name) => {
  if (name && registeredMotions.has(name))
    animation?.setIdleMotion(name)
})

defineExpose({
  canvasElement,
  captureFrame,
  setEmotion,
  listMorphs: () => morphs?.availableMorphs ?? [],
  listMotions: () => animation?.availableClips() ?? [],
})
</script>

<template>
  <Screen relative>
    <canvas ref="canvasRef" h-full w-full />
  </Screen>
</template>
