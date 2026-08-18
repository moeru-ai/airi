<script setup lang="ts">
import type { AnimationState, AssetManager, Skeleton, SpineCanvas, SpineCanvasApp } from '@esotericsoftware/spine-webgl'

import type { SpineAnimationManager } from '../../../composables/spine'
import type { Emotion } from '../../../constants/emotions'
import type { SpineModelVariant } from '../../../utils/spine-zip-loader'

import { Mutex } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { nextTick, onMounted, onUnmounted, ref, toRef, watch } from 'vue'

import { useSpineAnimationManager } from '../../../composables/spine'
import { EMOTION_SpineAnimationName_value, SPINE_IDLE_TRACK, SpineAnimationName } from '../../../constants/emotions'
import { useSpine } from '../../../stores/spine'
import { loadSpineRuntime } from '../../../utils/spine-runtime'
import { detectSpineVersionFromBinary, detectSpineVersionFromJson } from '../../../utils/spine-version'
import { loadSpineZip } from '../../../utils/spine-zip-loader'

const props = withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string
  canvas?: HTMLCanvasElement
  width: number
  height: number
  resolution?: number
  paused?: boolean
  premultipliedAlpha?: boolean
  defaultMixDuration?: number
  idleAnimationEnabled?: boolean
  maxFps?: number
}>(), {
  paused: false,
  resolution: 1,
  premultipliedAlpha: true,
  defaultMixDuration: 0.2,
  idleAnimationEnabled: true,
  maxFps: 0,
})

const emits = defineEmits<{
  (e: 'modelLoaded'): void
  (e: 'error', error: Error): void
  (e: 'animationsDiscovered', value: { animations: { name: string, duration: number }[], skins: { name: string }[] }): void
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const spineStore = useSpine()
const {
  position,
  scale,
  currentAnimation,
  currentSkin,
  availableAnimations,
  availableSkins,
  availableVariants,
  currentVariant,
  animationSpeed,
  oneShotAnimation,
} = storeToRefs(spineStore)

let isUnmounted = false
const modelLoadMutex = new Mutex()
const modelLoading = ref(false)

// Live runtime objects.
let spineCanvas: SpineCanvas | undefined
let assetCleanup: (() => void) | undefined
let animationManager: SpineAnimationManager | undefined
let skeleton: Skeleton | undefined
let animationState: AnimationState | undefined
let loadedVariants: SpineModelVariant[] = []

// Intrinsic model bounds at scale 1 with the root at the origin, captured on
// load and used to auto-fit the skeleton to the canvas. Undefined until a model
// is loaded, or when the setup pose has no renderable bounds.
let modelIntrinsicBounds: { x: number, y: number, width: number, height: number } | undefined

// Last time the skeleton was drawn, used to honour `maxFps`. The skeleton
// still advances every frame in `update`; only the GPU draw is throttled.
let lastRenderTime = 0

// Mutable defaults handed to the animation manager. The manager reads these
// fields on every call, so mutating them in place (see the prop watches
// below) propagates live setting changes without rebuilding the manager.
const animationDefaults = {
  mixDuration: props.defaultMixDuration,
  idleAnimationEnabled: props.idleAnimationEnabled,
}

const canvas = toRef(() => props.canvas)
const modelSrc = toRef(() => props.modelSrc)
const paused = toRef(() => props.paused)

function disposeSpine() {
  if (spineCanvas) {
    try {
      spineCanvas.dispose()
    }
    catch (err) {
      console.warn('[Spine] Failed to dispose SpineCanvas:', err)
    }
    spineCanvas = undefined
  }
  assetCleanup?.()
  assetCleanup = undefined
  animationManager = undefined
  skeleton = undefined
  animationState = undefined
  modelIntrinsicBounds = undefined
  spineStore.isModelLoaded = false
}

async function loadModel() {
  await modelLoadMutex.acquire()

  modelLoading.value = true
  componentState.value = 'loading'

  try {
    if (!canvas.value) {
      modelLoading.value = false
      componentState.value = 'mounted'
      return
    }

    if (!modelSrc.value) {
      console.warn('[Spine] No model source provided')
      disposeSpine()
      modelLoading.value = false
      componentState.value = 'mounted'
      return
    }

    disposeSpine()

    let assetPaths: { skeletonPath: string, atlasPath: string, skeletonFormat: 'binary' | 'json', texturePaths: string[] }
    let pathPrefix = ''
    let blobUrls: Record<string, string> | undefined
    let rawData: Record<string, Uint8Array | string> | undefined

    const isLocalBlob = modelSrc.value.startsWith('blob:')
    if (isLocalBlob || modelSrc.value.endsWith('.zip')) {
      const response = await fetch(modelSrc.value)
      const blob = await response.blob()
      const file = new File([blob], 'model.zip', { type: 'application/zip' })
      const loaded = await loadSpineZip(file)
      loadedVariants = loaded.variants

      // Populate variant store.
      availableVariants.value = loaded.variants.map(v => ({ name: v.name }))
      // Select stored variant or default to first.
      const selectedVariant = loaded.variants.find(v => v.name === currentVariant.value)
        ?? loaded.variants[0]
      if (selectedVariant && currentVariant.value !== selectedVariant.name)
        currentVariant.value = selectedVariant.name

      assetPaths = selectedVariant.layout
      blobUrls = loaded.blobUrls
      rawData = loaded.rawData
      assetCleanup = loaded.dispose
    }
    else {
      // Plain URL case: assume a sibling .skel/.json + .atlas next to the source.
      const baseUrl = new URL(modelSrc.value, window.location.href)
      pathPrefix = baseUrl.href.replace(/\/[^/]+$/, '/')
      const baseName = baseUrl.pathname.replace(/^.*\//, '').replace(/\.(?:json|skel|atlas)(?:\.txt)?$/i, '')
      const skeletonFormat: 'binary' | 'json' = baseUrl.pathname.toLowerCase().endsWith('.json') ? 'json' : 'binary'
      assetPaths = {
        skeletonPath: `${baseName}.${skeletonFormat === 'binary' ? 'skel' : 'json'}`,
        atlasPath: `${baseName}.atlas`,
        skeletonFormat,
        texturePaths: [],
      }
    }

    // Detect version from skeleton data to load the matching runtime.
    let detectedVersion = rawData
      ? (assetPaths.skeletonFormat === 'binary'
          ? detectSpineVersionFromBinary(rawData[assetPaths.skeletonPath] as Uint8Array)
          : detectSpineVersionFromJson(rawData[assetPaths.skeletonPath] as string))
      : undefined
    if (!detectedVersion)
      detectedVersion = '4.2'
    const spine = await loadSpineRuntime(detectedVersion)
    console.info(`[Spine] Detected skeleton version: ${detectedVersion}`)

    if (isUnmounted) {
      assetCleanup?.()
      modelLoading.value = false
      componentState.value = 'mounted'
      return
    }

    await new Promise<void>((resolve, reject) => {
      const app: SpineCanvasApp = {
        loadAssets: (sc) => {
          const am = sc.assetManager
          // NOTICE:
          // Patch BEFORE any load calls. SpineCanvas calls loadAssets
          // synchronously in its constructor, and am.loadBinary/loadJson/
          // loadTextureAtlas immediately dispatch XHRs. The downloader
          // checks rawDataUris at dispatch time — if we patch after the
          // constructor returns, requests already hit the dev server.
          if (blobUrls)
            patchAssetManagerForZipAssets(am, blobUrls, rawData!, assetPaths.texturePaths)

          if (assetPaths.skeletonFormat === 'binary')
            am.loadBinary(assetPaths.skeletonPath)
          else
            am.loadJson(assetPaths.skeletonPath)

          am.loadTextureAtlas(assetPaths.atlasPath)
        },
        initialize: (sc) => {
          try {
            const am = sc.assetManager
            const atlas = am.require(assetPaths.atlasPath) as import('@esotericsoftware/spine-webgl').TextureAtlas
            const attachmentLoader = new spine.AtlasAttachmentLoader(atlas)
            const skeletonData = assetPaths.skeletonFormat === 'binary'
              ? new spine.SkeletonBinary(attachmentLoader).readSkeletonData(am.require(assetPaths.skeletonPath) as Uint8Array)
              : new spine.SkeletonJson(attachmentLoader).readSkeletonData(am.require(assetPaths.skeletonPath) as string)

            skeleton = new spine.Skeleton(skeletonData)
            skeleton.setToSetupPose()

            const stateData = new spine.AnimationStateData(skeletonData)
            stateData.defaultMix = props.defaultMixDuration
            animationState = new spine.AnimationState(stateData)

            animationManager = useSpineAnimationManager(animationState, skeleton, animationDefaults)

            // Inventory animations and skins, populate the store.
            const animations = skeletonData.animations.map(animation => ({ name: animation.name, duration: animation.duration }))
            const skins = skeletonData.skins.map(s => ({ name: s.name }))
            availableAnimations.value = animations
            availableSkins.value = skins
            emits('animationsDiscovered', { animations, skins })

            // Apply the user's saved skin (if any).
            applySkin(currentSkin.value)

            // Capture the model's intrinsic bounds (scale 1, root at origin)
            // so applyTransformFromStore can auto-fit it to the canvas. Done
            // after the skin is applied because skin selection changes which
            // attachments are visible, and therefore the model's extent.
            skeleton.scaleX = 1
            skeleton.scaleY = 1
            skeleton.x = 0
            skeleton.y = 0
            if (spine.Physics)
              skeleton.updateWorldTransform(spine.Physics.update)
            else
              (skeleton as any).updateWorldTransform()
            const boundsOffset = new spine.Vector2()
            const boundsSize = new spine.Vector2()
            skeleton.getBounds(boundsOffset, boundsSize, [])
            modelIntrinsicBounds = boundsSize.x > 0 && boundsSize.y > 0
              ? { x: boundsOffset.x, y: boundsOffset.y, width: boundsSize.x, height: boundsSize.y }
              : undefined

            applyTransformFromStore()

            // Apply the user's saved idle animation.
            applyCurrentAnimation()

            spineStore.isModelLoaded = true
            emits('modelLoaded')
            resolve()
          }
          catch (err) {
            const error = err instanceof Error ? err : new Error(String(err))
            emits('error', error)
            reject(error)
          }
        },
        update: (_sc, delta) => {
          if (!skeleton || !animationState)
            return
          if (paused.value) {
            return
          }
          animationState.update(delta * animationSpeed.value)
          animationState.apply(skeleton)
          // Physics was added in Spine 4.2; older runtimes take no argument.
          if (spine.Physics)
            skeleton.updateWorldTransform(spine.Physics.update)
          else
            (skeleton as any).updateWorldTransform()
        },
        render: (sc) => {
          if (!skeleton)
            return
          // Cap the draw rate when maxFps > 0. Animation timing stays correct
          // because `update` keeps advancing every frame; we only skip the GPU
          // draw to honour the configured ceiling.
          if (props.maxFps > 0) {
            const now = performance.now()
            if (now - lastRenderTime < 1000 / props.maxFps)
              return
            lastRenderTime = now
          }
          const renderer = sc.renderer
          renderer.resize(spine.ResizeMode.Expand)
          sc.gl.clearColor(0, 0, 0, 0)
          sc.gl.clear(sc.gl.COLOR_BUFFER_BIT)
          renderer.begin()
          renderer.drawSkeleton(skeleton, props.premultipliedAlpha)
          renderer.end()
        },
        error: (_sc, errors: Record<string, string>) => {
          const message = Object.values(errors).join('; ')
          const error = new Error(message)
          emits('error', error)
          reject(error)
        },
      }

      spineCanvas = new spine.SpineCanvas(canvas.value!, {
        app,
        pathPrefix,
        webglConfig: { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true },
      })
    })
  }
  catch (err) {
    console.error('[Spine] Failed to load model:', err)
    emits('error', err instanceof Error ? err : new Error(String(err)))
  }
  finally {
    modelLoading.value = false
    componentState.value = 'mounted'
    modelLoadMutex.release()
  }
}

/**
 * Patches the AssetManager's Downloader to serve ZIP-extracted assets from
 * memory. Skeleton/atlas data is served directly from `rawData`; texture
 * pages use blob URLs registered in `rawDataUris` for `image.src`.
 *
 * NOTICE:
 * Spine's Downloader.rawDataUris has a broken heuristic: values without "."
 * are decoded as data: URIs via atob(). In Electron, blob URLs are
 * `blob:null/<uuid>` (no dots) → treated as inline data → 400 error.
 * Even with data: URIs, the atob round-trip corrupts multi-byte binary.
 * We bypass rawDataUris entirely for text/binary and monkey-patch the
 * download methods to resolve from the in-memory `rawData` map.
 * Source: spine-core/AssetManagerBase.js Downloader class.
 * Removal condition: Spine ships a Blob/ArrayBuffer-aware asset loader.
 */
function patchAssetManagerForZipAssets(
  assetManager: AssetManager,
  blobUrls: Record<string, string>,
  rawData: Record<string, Uint8Array | string>,
  texturePaths: string[],
) {
  const downloader = (assetManager as unknown as {
    downloader?: {
      rawDataUris: Record<string, string>
      downloadText: (url: string, success: (data: string) => void, error: (status: number, responseText: string) => void) => void
      downloadBinary: (url: string, success: (data: Uint8Array) => void, error: (status: number, response: unknown) => void) => void
    }
  }).downloader
  if (!downloader)
    return

  // Build a lookup keyed by both full path and bare filename.
  const textLookup = new Map<string, string>()
  const binaryLookup = new Map<string, Uint8Array>()
  for (const [path, data] of Object.entries(rawData)) {
    const bare = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
    if (typeof data === 'string') {
      textLookup.set(path, data)
      textLookup.set(bare, data)
    }
    else {
      binaryLookup.set(path, data)
      binaryLookup.set(bare, data)
    }
  }

  const origDownloadText = downloader.downloadText.bind(downloader)
  const origDownloadBinary = downloader.downloadBinary.bind(downloader)

  downloader.downloadText = (url, success, error) => {
    const data = textLookup.get(url)
    if (data !== undefined) {
      queueMicrotask(() => success(data))
      return
    }
    origDownloadText(url, success, error)
  }

  downloader.downloadBinary = (url, success, error) => {
    const data = binaryLookup.get(url)
    if (data !== undefined) {
      queueMicrotask(() => success(data))
      return
    }
    origDownloadBinary(url, success, error)
  }

  // Texture blob URLs → rawDataUris for image.src resolution in loadTexture.
  for (const path of texturePaths) {
    const url = blobUrls[path]
    if (!url)
      continue
    downloader.rawDataUris[path] = url
    const slash = path.lastIndexOf('/')
    if (slash !== -1)
      downloader.rawDataUris[path.slice(slash + 1)] = url
  }
}

function applyTransformFromStore() {
  if (!skeleton || !canvas.value)
    return

  // The SpineCanvas camera sits at world origin (0,0), so screen centre maps
  // to world (0,0) and the visible region is [-w/2, w/2] x [-h/2, h/2] (y up).
  const w = canvas.value.width
  const h = canvas.value.height

  // Base scale auto-fits the model's intrinsic bounds into the canvas so tall
  // or oversized rigs are fully visible by default. The user's `scale` setting
  // multiplies on top, so 1 means "fit". Without bounds we fall back to raw
  // user scale and a centred root.
  let baseScale = 1
  if (modelIntrinsicBounds) {
    const margin = 0.9
    const fitScale = Math.min(w / modelIntrinsicBounds.width, h / modelIntrinsicBounds.height) * margin
    if (Number.isFinite(fitScale) && fitScale > 0)
      baseScale = fitScale
  }
  const finalScale = baseScale * scale.value
  skeleton.scaleX = finalScale
  skeleton.scaleY = finalScale

  if (modelIntrinsicBounds) {
    // Centre the bounding box at world origin, then apply the user's pixel
    // offsets. Bounds scale linearly with skeleton scale because the root sits
    // at the origin without rotation.
    const centreX = modelIntrinsicBounds.x + modelIntrinsicBounds.width / 2
    const centreY = modelIntrinsicBounds.y + modelIntrinsicBounds.height / 2
    skeleton.x = -finalScale * centreX + position.value.x
    skeleton.y = -finalScale * centreY + position.value.y
  }
  else {
    skeleton.x = position.value.x
    skeleton.y = position.value.y
  }
}

function applyCurrentAnimation() {
  if (!animationManager)
    return
  const desired = currentAnimation.value?.name ?? SpineAnimationName.Idle
  animationManager.setIdle(desired, currentAnimation.value?.loop ?? true)
}

function applySkin(skinName: string) {
  if (!skeleton)
    return

  if (!skinName) {
    skeleton.setSkinByName(skeleton.data.defaultSkin?.name ?? skeleton.data.skins[0]?.name ?? 'default')
    skeleton.setSlotsToSetupPose()
    return
  }

  const skin = skeleton.data.findSkin(skinName)
  if (skin) {
    skeleton.setSkin(skin)
    skeleton.setSlotsToSetupPose()
  }
}

/**
 * Plays an emotion-tagged animation on the dedicated emotion track.
 *
 * Use when:
 * - The chat orchestrator emits an `EmotionPayload`. The Stage component
 *   forwards the emotion name here so the model can react in real time
 *   without disturbing the persistent idle loop on track 0.
 *
 * Expects:
 * - The skeleton has loaded (`componentState === 'mounted'`). The call is
 *   a no-op if invoked before then.
 *
 * Returns:
 * - The resolved animation name when one was found, otherwise `undefined`.
 */
function setEmotion(emotion: Emotion, intensity: number = 1): string | undefined {
  if (!animationManager)
    return undefined
  const animationName = EMOTION_SpineAnimationName_value[emotion]
  if (!animationName)
    return undefined
  // Intensity scales the emotion track's blend weight so a stronger emotion
  // overrides more of the idle pose. Clamp to [0, 1]; alpha outside that range
  // is undefined behaviour in Spine's track mixing.
  const alpha = Math.min(1, Math.max(0, intensity))
  const entry = animationManager.playEmotion(animationName, { alpha })
  return entry?.animation?.name
}

watch(modelSrc, async () => await loadModel(), { immediate: true })
watch(canvas, async (next, prev) => {
  if (next && next !== prev)
    await loadModel()
})

watch([() => props.width, () => props.height, () => props.resolution, position, scale], async () => {
  // The sibling Canvas component resizes the backing store in its own watcher
  // when width/height/resolution change. Wait a tick so `canvas.width/height`
  // reflect the new size before we recompute the skeleton's centre.
  await nextTick()
  applyTransformFromStore()
}, { deep: true })

watch(currentAnimation, () => {
  applyCurrentAnimation()
}, { deep: true })

watch(oneShotAnimation, (req) => {
  if (req)
    animationManager?.playEmotion(req.name, { loop: req.loop })
})

watch(currentSkin, (skinName) => {
  applySkin(skinName)
})

watch(currentVariant, async () => {
  if (loadedVariants.length > 1)
    await loadModel()
})

watch(() => props.idleAnimationEnabled, (enabled) => {
  animationDefaults.idleAnimationEnabled = enabled
  if (!animationManager || !skeleton || !animationState)
    return
  if (enabled)
    applyCurrentAnimation()
  else
    animationState.setEmptyAnimation(SPINE_IDLE_TRACK, props.defaultMixDuration)
})

watch(() => props.defaultMixDuration, (mix) => {
  animationDefaults.mixDuration = mix
  if (animationState)
    animationState.data.defaultMix = mix
})

watch(paused, () => {
  // SpineCanvas does not expose a built-in pause; we toggle by stopping
  // the update step from advancing time (handled in the update callback).
  // We still let render run so the last frame remains visible.
})

onMounted(async () => {
  // First load is triggered by the immediate watch above when the canvas
  // becomes available.
})

onUnmounted(() => {
  isUnmounted = true
  disposeSpine()
})

defineExpose({
  setEmotion,
  listAnimations: () => animationManager?.listAnimations() ?? [],
  listSkins: () => availableSkins.value.map(s => s.name),
})

import.meta.hot?.dispose(() => {
  console.warn('[Dev] Reload on HMR dispose is active for this component. Performing a full reload.')
  window.location.reload()
})
</script>

<template>
  <slot />
</template>
