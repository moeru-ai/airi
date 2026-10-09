<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { Filter } from '@pixi/core'
import type {
  AmbientLightEnvironment,
  AmbientLightFilterOptions,
  NormalizedRectangle,
  ScreenAmbientLightMode,
} from '@proj-airi/stage-shared/screen-ambient-light'
import type { Live2DModel as PixiLive2DModel } from 'pixi-live2d-display'

import type { PixiLive2DInternalModel } from '../../../composables/live2d'

import { listenBeatSyncBeatSignal } from '@proj-airi/stage-shared/beat-sync'
import { ambientLightDefaults, ambientLightNeutralEnvironment, ambientLightPerceptualLevel, wholeWindowRectangle } from '@proj-airi/stage-shared/screen-ambient-light'
import { useTheme } from '@proj-airi/ui'
import { until } from '@vueuse/core'
import { animate } from 'animejs'
import { formatHex } from 'culori'
import { Mutex } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { DropShadowFilter } from 'pixi-filters'
import { computed, onMounted, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'

import {
  createBeatSyncController,
  createLive2DHeadTracker,
  createLive2DMotionSpring,
  disableLive2DSdkBreath,
  live2DCanvasRectToParent,
  resolveIdleMotionGroup,
  useExpressionController,
  useLive2DMotionManagerUpdate,
  useMotionUpdatePluginAutoEyeBlink,
  useMotionUpdatePluginBeatSync,
  useMotionUpdatePluginBreathControl,
  useMotionUpdatePluginExpression,
  useMotionUpdatePluginIdleDisable,
  useMotionUpdatePluginIdleFocus,
  useMotionUpdatePluginLightSquint,
  useMotionUpdatePluginLipSync,
  useMotionUpdatePluginManualControl,
} from '../../../composables/live2d'
import { useFitModel } from '../../../composables/live2d/fit-model'
import { Emotion, EmotionNeutralMotionName } from '../../../constants/emotions'
import { ScreenAmbientLightFilter } from '../../../filters/screen-ambient-light'
import { disableIdleEyeMovement } from '../../../generations/loader'
import { getLive2DMotionControlModelOffset, useL2dViewControl, useLive2DMotionControl, useLive2dParams } from '../../../stores'
import { resolveLive2DRuntime, setupLive2DModel } from '../../../utils/live2d-runtime'
import { useModelParameterSync } from './model-parameter-sync'

const props = withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string

  app?: Application
  mouthOpenSize?: number
  nowSpeaking?: boolean
  width: number
  height: number
  paused?: boolean
  focusAt?: { x: number, y: number }
  eyeTracking?: boolean
  eyeFocusSourceActive?: boolean
  themeColorsHue?: number
  themeColorsHueDynamic?: boolean
  live2dIdleAnimationEnabled?: boolean
  live2dForceIdleEyeAnimation?: boolean
  live2dAutoBlinkEnabled?: boolean
  live2dForceAutoBlinkEnabled?: boolean
  live2dExpressionEnabled?: boolean
  live2dShadowEnabled?: boolean
  screenAmbientLightActive?: boolean
  screenAmbientLightFilterOptions?: AmbientLightFilterOptions
  screenAmbientLightEnvironment?: AmbientLightEnvironment
  screenAmbientLightSubject?: NormalizedRectangle
  screenAmbientLightMode?: ScreenAmbientLightMode
  screenAmbientLightStrength?: number
  screenAmbientLightSquint?: number
}>(), {
  mouthOpenSize: 0,
  nowSpeaking: false,
  paused: false,
  focusAt: () => ({ x: 0, y: 0 }),
  eyeTracking: false,
  eyeFocusSourceActive: false,
  disableFocusAt: false,
  scale: 1,
  themeColorsHue: 220.44,
  themeColorsHueDynamic: false,
  live2dIdleAnimationEnabled: true,
  live2dForceIdleEyeAnimation: true,
  live2dAutoBlinkEnabled: true,
  live2dForceAutoBlinkEnabled: false,
  live2dExpressionEnabled: true,
  live2dShadowEnabled: true,
  screenAmbientLightActive: false,
  screenAmbientLightFilterOptions: () => ({ ...ambientLightDefaults.filter }),
  screenAmbientLightEnvironment: () => ambientLightNeutralEnvironment,
  screenAmbientLightSubject: () => wholeWindowRectangle,
  screenAmbientLightMode: ambientLightDefaults.mode,
  screenAmbientLightStrength: ambientLightDefaults.strength,
  screenAmbientLightSquint: ambientLightDefaults.squint,
})

const emits = defineEmits<{
  (e: 'modelLoaded'): void
  (e: 'error', error: Error): void
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const { position, scale } = useL2dViewControl()
const {
  breathControl: manualBreathControl,
  control: manualMotionControl,
} = storeToRefs(useLive2DMotionControl())

const modelSrcRef = toRef(() => props.modelSrc)

const modelLoading = ref(false)
// NOTICE: boolean is sufficient; this flag is only used inside loadModel to bail out if the component unmounts mid-load.
let isUnmounted = false

const modelLoadMutex = new Mutex()

const manualMotionSpring = createLive2DMotionSpring()
const manualControlOffset = computed(() => getLive2DMotionControlModelOffset(manualMotionSpring.output.value))
const offset = computed(() => ({
  x: (position.value.x / 100) * props.width + manualControlOffset.value.x,
  y: -(position.value.y / 100) * props.height + manualControlOffset.value.y,
}))

const pixiApp = toRef(() => props.app)
const paused = toRef(() => props.paused)
const focusAt = toRef(() => props.focusAt)
const model = shallowRef<PixiLive2DModel<PixiLive2DInternalModel>>()
const forceMotionPriority = shallowRef<number>()
const initialModelWidth = ref<number>(0)
const initialModelHeight = ref<number>(0)
const mouthOpenSize = computed(() => Math.max(0, Math.min(100, props.mouthOpenSize)))
const nowSpeaking = toRef(() => props.nowSpeaking)
const lastUpdateAtMs = ref(0)

const { isDark: dark } = useTheme()

/** Shadow opacity over a black screen, before the exposure fades it. */
const dropShadowBaseAlpha = 0.2

/**
 * Softness of the drop shadow, in pixels.
 *
 * At 0 the shadow is a hard copy of the silhouette, offset by its distance. A
 * dark desktop hides that copy at this opacity, but over a white window it
 * reads as a second character. It also carries the theme hue: measured over
 * white, the hard shadow took the band beside the character to red 242.3 while
 * blue stayed at 252.7, which shows as a cyan edge.
 */
const dropShadowBlur = 10

/**
 * How much a bright screen fades the drop shadow out.
 *
 * The shadow separates the character from the desktop, and the light wrap
 * blends the same edge. A bright desktop is where the shadow is most visible,
 * so it recedes there and keeps full strength over a dark desktop.
 */
const dropShadowExposureFalloff = 0.75

const dropShadowFilter = shallowRef(new DropShadowFilter({
  alpha: dropShadowBaseAlpha,
  blur: dropShadowBlur,
  distance: 20,
  rotation: 45,
}))
const screenAmbientLightFilter = shallowRef(new ScreenAmbientLightFilter())

let resizeAnimation: ReturnType<typeof animate> | undefined

const modelNormalizeParams = useFitModel(
  () => ({ width: props.width, height: props.height }),
  () => ({ width: initialModelWidth.value, height: initialModelHeight.value }),
)

watch([offset, scale, modelNormalizeParams], () => {
  setScaleAndPosition()
})

function setScaleAndPosition(animated = false) {
  if (!model.value)
    return

  const normalized = modelNormalizeParams.value

  if (!animated) {
    model.value.scale.set(normalized.scale * scale.value, normalized.scale * scale.value)
    model.value.x = normalized.x + offset.value.x
    model.value.y = normalized.y + offset.value.y
    return
  }

  resizeAnimation?.pause()

  const current = {
    scale: model.value.scale.x,
    x: model.value.x,
    y: model.value.y,
  }

  resizeAnimation = animate(current, {
    scale: normalized.scale * scale.value,
    x: normalized.x + offset.value.x,
    y: normalized.y + offset.value.y,
    duration: 200,
    ease: 'outQuad',
    onUpdate: () => {
      if (!model.value)
        return
      model.value.scale.set(current.scale, current.scale)
      model.value.x = current.x
      model.value.y = current.y
    },
  })
}

const live2dStore = useLive2dParams()
const {
  currentMotion,
  availableMotions,
  motionMap,
  modelParameters,
} = storeToRefs(live2dStore)
const applyStoredModelParameters = useModelParameterSync(model, modelParameters)

const themeColorsHue = toRef(() => props.themeColorsHue)
const themeColorsHueDynamic = toRef(() => props.themeColorsHueDynamic)
const live2dIdleAnimationEnabled = toRef(() => props.live2dIdleAnimationEnabled)
const live2dEyeTrackingEnabled = toRef(() => props.eyeTracking)
const live2dEyeFocusSourceActive = toRef(() => props.eyeFocusSourceActive)
const live2dForceIdleEyeAnimation = toRef(() => props.live2dForceIdleEyeAnimation)
const live2dAutoBlinkEnabled = toRef(() => props.live2dAutoBlinkEnabled)
const live2dForceAutoBlinkEnabled = toRef(() => props.live2dForceAutoBlinkEnabled)
const live2dExpressionEnabled = toRef(() => props.live2dExpressionEnabled)
const live2dShadowEnabled = toRef(() => props.live2dShadowEnabled)
const screenAmbientLightActive = toRef(() => props.screenAmbientLightActive)
const screenAmbientLightFilterOptions = toRef(() => props.screenAmbientLightFilterOptions)
const screenAmbientLightEnvironment = toRef(() => props.screenAmbientLightEnvironment)
const screenAmbientLightSubject = toRef(() => props.screenAmbientLightSubject)
const screenAmbientLightMode = toRef(() => props.screenAmbientLightMode)
const screenAmbientLightStrength = toRef(() => props.screenAmbientLightStrength)
const screenAmbientLightSquint = toRef(() => props.screenAmbientLightSquint)

// --- Expression controller
// Chooses which drawables stand in for the head once per model, so it is reset
// whenever the model is replaced.
const headTracker = createLive2DHeadTracker()
const internalModelRef = shallowRef<PixiLive2DInternalModel>()
const expressionController = useExpressionController({
  internalModel: internalModelRef,
})
// This identity belongs to model.value. It changes only when a model load
// commits, so expression initialization cannot observe a newer prop by mistake.
let loadedModelId: string | undefined
// Saved SDK manager references for runtime expression toggle (restore on disable)
const savedEyeBlink = shallowRef<any>(null)
const savedExpressionManager = shallowRef<any>(null)

const localCurrentMotion = ref<{ group: string, index: number }>({ group: 'Idle', index: 0 })
const beatSync = createBeatSyncController({
  baseAngles: () => ({
    x: modelParameters.value.angleX,
    y: modelParameters.value.angleY,
    z: modelParameters.value.angleZ,
  }),
  initialStyle: 'sway-sine',
})

// Listen for model reload requests (e.g., when runtime motion is uploaded)
const disposeShouldUpdateView = live2dStore.onShouldUpdateView(() => {
  loadModel()
})

async function loadModel() {
  await until(modelLoading).not.toBeTruthy()

  await modelLoadMutex.acquire()
  try {
    await performModelLoad()
  }
  finally {
    modelLoadMutex.release()
  }
}

async function performModelLoad() {
  modelLoading.value = true
  componentState.value = 'loading'

  if (!pixiApp.value || !pixiApp.value.stage) {
    try {
      // NOTICE: shouldUpdateView can fire while the canvas (pixiApp) is being torn down/recreated.
      // Wait briefly for the new stage instead of bailing out, otherwise we keep a blank screen.
      await until(() => !!pixiApp.value && !!pixiApp.value.stage).toBeTruthy({ timeout: 1500 })
    }
    catch {
      modelLoading.value = false
      componentState.value = 'mounted'
      return
    }
  }

  // REVIEW: here as await until(...) guarded the pixiApp and stage to be valid.
  if (model.value && pixiApp.value?.stage) {
    // Dispose expression controller before destroying the old model
    expressionController.dispose()
    internalModelRef.value = undefined
    loadedModelId = undefined

    try {
      pixiApp.value.stage.removeChild(model.value)
      model.value.destroy()
    }
    catch (error) {
      console.warn('Error removing old model:', error)
    }
    model.value = undefined
    headTracker.reset()
  }
  const pendingModel = {
    id: props.modelId,
    src: modelSrcRef.value,
  }
  if (!pendingModel.src) {
    console.warn('No Live2D model source provided.')
    modelLoading.value = false
    componentState.value = 'mounted'
    return
  }

  try {
    if (isUnmounted) {
      modelLoading.value = false
      componentState.value = 'mounted'
      return
    }

    const { runtime } = await resolveLive2DRuntime()
    const { Live2DModel, MotionPriority } = runtime
    forceMotionPriority.value = MotionPriority.FORCE
    const live2DModel = new Live2DModel<PixiLive2DInternalModel>()
    await setupLive2DModel(runtime, live2DModel, { url: pendingModel.src, id: pendingModel.id }, pixiApp.value!.renderer, { autoInteract: false })
    if (isUnmounted) {
      live2DModel.destroy()
      return
    }

    // --- Scene

    model.value = live2DModel
    // REVIEW: pixiApp and stage are guaranteed to be valid here due to the until(...) above.
    pixiApp.value!.stage.addChild(model.value)
    initialModelWidth.value = model.value.width
    initialModelHeight.value = model.value.height
    model.value.anchor.set(0.5, 0.5)
    setScaleAndPosition()

    // --- Interaction

    model.value.on('hit', (hitAreas) => {
      if (model.value && hitAreas.includes('body'))
        model.value.motion('tap_body')
    })

    // --- Motion

    const internalModel = model.value.internalModel
    const coreModel = internalModel.coreModel
    const motionManager = internalModel.motionManager
    disableLive2DSdkBreath(internalModel)
    coreModel.setParameterValueById('ParamMouthOpenY', mouthOpenSize.value)

    const detectedIdleGroup = resolveIdleMotionGroup(motionManager.definitions)
    if (detectedIdleGroup)
      motionManager.groups.idle = detectedIdleGroup

    disableIdleEyeMovement(internalModel)

    availableMotions.value = Object
      .entries(motionManager.definitions)
      .flatMap(([motionName, definition]) => (definition?.map((motion: any, index: number) => ({
        motionName,
        motionIndex: index,
        fileName: motion.File ?? motion.file,
      })) || []))
      .filter(Boolean)

    availableMotions.value.forEach((motion) => {
      motionMap.value[motion.fileName] = motion.motionName in Emotion
        ? motion.motionName
        : EmotionNeutralMotionName
    })

    // Check if user has selected a runtime motion to play as idle
    const selectedMotionGroup = localStorage.getItem('selected-runtime-motion-group')
    const selectedMotionIndex = localStorage.getItem('selected-runtime-motion-index')

    if (selectedMotionGroup !== null && selectedMotionIndex && live2dIdleAnimationEnabled.value) {
      setTimeout(() => {
        console.info('Playing selected runtime motion:', selectedMotionGroup, selectedMotionIndex)
        currentMotion.value = {
          group: selectedMotionGroup,
          index: Number.parseInt(selectedMotionIndex),
        }
      }, 300)
    }

    // This is hacky too
    const motionManagerUpdate = useLive2DMotionManagerUpdate({
      internalModel,
      motionManager,
      modelParameters,
      live2dEyeTrackingEnabled,
      live2dEyeFocusSourceActive,
      live2dIdleAnimationEnabled,
      live2dForceIdleEyeAnimation,
      live2dAutoBlinkEnabled,
      live2dForceAutoBlinkEnabled,
      lastUpdateAtMs,
    })

    motionManagerUpdate.register(useMotionUpdatePluginBeatSync(beatSync), 'pre')
    motionManagerUpdate.register(useMotionUpdatePluginIdleDisable(), 'pre')
    motionManagerUpdate.register(useMotionUpdatePluginIdleFocus(), 'final')
    // Both run in 'final' stage (ignores handled state).
    // Expression first: sets desired parameter values (e.g. closed eyes = 0).
    // Blink second: reads post-expression eye values, Multiply-modulates on top.
    // This ensures blink respects expression state (0 × blinkFactor = 0).
    motionManagerUpdate.register(useMotionUpdatePluginExpression(expressionController), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginAutoEyeBlink(live2dExpressionEnabled), 'final')
    // After the blink plugin, so that it only narrows the value a blink returns
    // to. The signal is the light behind the character, not the screen level:
    // that is a mean over the whole capture, and a bright window opening in a
    // far corner would otherwise reach the eyes.
    motionManagerUpdate.register(
      useMotionUpdatePluginLightSquint(
        () => ambientLightPerceptualLevel(screenAmbientLightEnvironment.value.behindLuminance),
        () => (screenAmbientLightActive.value ? screenAmbientLightSquint.value : 0),
      ),
      'final',
    )
    motionManagerUpdate.register(useMotionUpdatePluginManualControl(manualMotionControl, manualMotionSpring), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginLipSync(mouthOpenSize, nowSpeaking), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginBreathControl(manualBreathControl), 'final')

    const hookedUpdate = motionManager.update as (model: PixiLive2DInternalModel['coreModel'], now: number) => boolean
    motionManager.update = function (model: PixiLive2DInternalModel['coreModel'], now: number) {
      return motionManagerUpdate.hookUpdate(model, now, hookedUpdate)
    }

    motionManager.on('motionStart', (group, index) => {
      localCurrentMotion.value = { group, index }
    })

    // Listen for motion finish to restart runtime motion for looping
    motionManager.on('motionFinish', () => {
      const selectedMotionGroup = localStorage.getItem('selected-runtime-motion-group')
      const selectedMotionIndex = localStorage.getItem('selected-runtime-motion-index')

      if (selectedMotionGroup !== null && selectedMotionIndex && live2dIdleAnimationEnabled.value) {
        // Restart the selected runtime motion immediately for seamless looping
        console.info('Motion finished, restarting runtime motion:', selectedMotionGroup, selectedMotionIndex)
        // Use requestAnimationFrame to restart on the next frame for smooth transition
        requestAnimationFrame(() => {
          currentMotion.value = {
            group: selectedMotionGroup,
            index: Number.parseInt(selectedMotionIndex),
          }
        })
      }
    })

    applyStoredModelParameters(coreModel)

    // Save SDK manager references so they can be restored if expression is
    // toggled off at runtime.
    savedEyeBlink.value = internalModel.eyeBlink
    savedExpressionManager.value = motionManager.expressionManager
    loadedModelId = pendingModel.id

    // --- Expression controller initialisation (conditional)
    if (live2dExpressionEnabled.value) {
      // Disable built-in Cubism expression manager — our expression-controller
      // replaces it. The SDK's manager runs after motionManager.update() and
      // would overwrite our final-plugin values every frame.
      if (motionManager.expressionManager) {
        ;(motionManager as any).expressionManager = null
      }
      // Disable SDK eyeBlink — it runs on frames where motionUpdated=false and
      // would conflict with expression eye parameter overrides. Our auto-blink
      // plugin (Force Auto Blink setting) provides the replacement for models
      // without idle-motion blink curves.
      if (internalModel.eyeBlink) {
        ;(internalModel as any).eyeBlink = null
      }

      internalModelRef.value = internalModel
    }

    emits('modelLoaded')
  }
  catch (error) {
    console.error('[Live2D] Failed to load model:', error)
    emits('error', error instanceof Error ? error : new Error(String(error)))
  }
  finally {
    modelLoading.value = false
    componentState.value = 'mounted'
    await initExpressionController(internalModelRef.value, loadedModelId).catch((err) => {
      console.warn('[Model.vue] Expression controller initialization failed:', err)
    })
  }
}

/**
 * Initialise the expression controller by reading expression definitions from
 * the model settings and parsing each referenced expression file.
 *
 * This is intentionally fire-and-forget from loadModel so that a failure in
 * expression loading does not prevent the model itself from rendering.
 */
async function initExpressionController(internalModel?: PixiLive2DInternalModel, modelId?: string) {
  // Dispose any previous state (handles model reloads)
  expressionController.dispose()

  const settings = internalModel?.settings as any
  if (!settings)
    return

  const expressionRefs: { Name: string, File: string }[] = (settings.expressions ?? []).map((expression: any) => ({
    Name: expression.Name ?? expression.name,
    File: expression.File ?? expression.file,
  }))
  if (expressionRefs.length === 0)
    return

  // Build a function that can read exp3 files relative to the model root.
  // For URL-loaded models, resolveURL gives us the full URL. For ZIP-loaded
  // models the resolved URL points to an in-memory blob/object URL.
  const readExpFile = async (filePath: string): Promise<string> => {
    const embeddedExpression = settings._expFiles?.find((expression: any) =>
      expression.fileName === filePath || expression.fileName.endsWith(`/${filePath}`),
    )
    if (embeddedExpression)
      return JSON.stringify(embeddedExpression.data)

    const resolvedUrl: string = settings.resolveURL?.(filePath) ?? filePath
    const response = await fetch(resolvedUrl)
    if (!response.ok)
      throw new Error(`Failed to fetch exp3 file: ${filePath} (${response.status})`)
    return response.text()
  }

  await expressionController.initialise(modelId, expressionRefs, readExpFile)
}

async function setMotion(motionName: string, index?: number) {
  // TODO: motion? Not every Live2D model has motion, we do need to help users to set motion
  if (!model.value) {
    console.warn('Cannot set motion: model not loaded')
    return
  }

  console.info('Setting motion:', motionName, 'index:', index)
  try {
    await model.value.motion(motionName, index, forceMotionPriority.value)
    console.info('Motion started successfully:', motionName)
  }
  catch (error) {
    console.error('Failed to start motion:', motionName, error)
  }
}

const dropShadowColorComputer = ref<HTMLDivElement>()
const dropShadowAnimationId = ref(0)

function updateAmbientLightFilter() {
  if (!screenAmbientLightActive.value)
    return

  screenAmbientLightFilter.value.update({
    environment: screenAmbientLightEnvironment.value,
    // The measurement placed its maps around this rectangle, so the shader has
    // to read them from it rather than from the whole window.
    subject: screenAmbientLightSubject.value,
    mode: screenAmbientLightMode.value,
    strength: screenAmbientLightStrength.value,
    options: screenAmbientLightFilterOptions.value,
  })
}

function updateDropShadow() {
  // The measured screen level only applies while the ambient light is running.
  // Without it the shadow keeps one strength, which is the behavior for a stage
  // that never samples the screen.
  const exposure = screenAmbientLightActive.value
    ? screenAmbientLightEnvironment.value.exposure
    : 0
  dropShadowFilter.value.alpha = dropShadowBaseAlpha * (1 - dropShadowExposureFalloff * exposure)

  if (!dropShadowColorComputer.value)
    return

  const color = getComputedStyle(dropShadowColorComputer.value).backgroundColor
  dropShadowFilter.value.color = Number(formatHex(color)!.replace('#', '0x'))
}

// The filter array is replaced only when the set of filters changes. The
// shadow loop below runs every frame, and a fresh array per frame would make
// Pixi re-evaluate the filter stack for nothing.
function updateFilterStack() {
  if (!model.value)
    return

  const filters: Filter[] = []
  if (screenAmbientLightActive.value)
    filters.push(screenAmbientLightFilter.value)
  if (live2dShadowEnabled.value)
    filters.push(dropShadowFilter.value)

  const current = model.value.filters ?? []
  const unchanged = current.length === filters.length
    && current.every((filter, index) => filter === filters[index])
  if (!unchanged)
    model.value.filters = filters
}

function updateModelFilters() {
  updateAmbientLightFilter()
  updateDropShadow()
  updateFilterStack()
}

watch(modelSrcRef, async () => await loadModel(), { immediate: true })
watch(dark, updateModelFilters, { immediate: true })
watch([model, themeColorsHue], updateModelFilters)
watch([live2dShadowEnabled, screenAmbientLightActive], updateFilterStack)
watch(
  [
    screenAmbientLightActive,
    screenAmbientLightFilterOptions,
    screenAmbientLightEnvironment,
    screenAmbientLightMode,
    screenAmbientLightStrength,
  ],
  updateModelFilters,
)

// TODO: This is hacky!
// The theme hue animates, so the shadow color follows it once per frame. Only
// the shadow color belongs here. The ambient-light uniforms update on change,
// and the light maps would otherwise upload on every frame.
function updateDropShadowFilterLoop() {
  updateDropShadow()
  if (!live2dShadowEnabled.value) {
    dropShadowAnimationId.value = 0
    return
  }

  dropShadowAnimationId.value = requestAnimationFrame(updateDropShadowFilterLoop)
}

watch([themeColorsHueDynamic, live2dShadowEnabled], ([dynamic, shadowEnabled]) => {
  if (dynamic && shadowEnabled) {
    dropShadowAnimationId.value = requestAnimationFrame(updateDropShadowFilterLoop)
  }
  else {
    cancelAnimationFrame(dropShadowAnimationId.value)
    dropShadowAnimationId.value = 0
  }
}, { immediate: true })

watch(currentMotion, value => setMotion(value.group, value.index))
watch(paused, value => value ? pixiApp.value?.stop() : pixiApp.value?.start())

// Watch for idle animation setting changes and stop motions if disabled
watch(live2dIdleAnimationEnabled, (enabled) => {
  if (!enabled && model.value) {
    const internalModel = model.value.internalModel
    if (internalModel?.motionManager) {
      internalModel.motionManager.stopAllMotions()
    }
  }
})

// Watch for expression system toggle — nullify/restore SDK managers at runtime
watch(live2dExpressionEnabled, (enabled) => {
  if (!model.value)
    return
  const im = model.value.internalModel
  const mm = im.motionManager
  if (enabled) {
    if (mm.expressionManager) {
      (mm as any).expressionManager = null
    }
    if (im.eyeBlink) {
      (im as any).eyeBlink = null
    }

    internalModelRef.value = im
    initExpressionController(im, loadedModelId).catch((err) => {
      console.warn('[Model.vue] Expression controller initialisation failed:', err)
    })
  }
  else {
    mm.expressionManager = savedExpressionManager.value
    im.eyeBlink = savedEyeBlink.value
    expressionController.dispose()
    internalModelRef.value = undefined
  }
})

watch(focusAt, (value) => {
  if (!model.value)
    return
  if (!props.eyeTracking)
    return

  model.value.focus(value.x, value.y)
})

onMounted(() => {
  const removeListener = listenBeatSyncBeatSignal(() => beatSync.scheduleBeat())
  onUnmounted(() => removeListener())
})

onMounted(async () => {
  updateModelFilters()
})

onUnmounted(() => {
  isUnmounted = true
  resizeAnimation?.pause()
  disposeShouldUpdateView?.()
  expressionController.dispose()
  loadedModelId = undefined

  // Destroying a display object does not destroy its filters, and each mount
  // creates its own pair, so the light-map textures and the blur pass would
  // stay on the GPU for every renderer switch. The stack comes off the model
  // first so that nothing can reference a destroyed filter.
  if (model.value)
    model.value.filters = []
  screenAmbientLightFilter.value.destroy()
  dropShadowFilter.value.destroy()
})

function listMotionGroups() {
  return availableMotions.value
}

/**
 * The head's box in the space the stage draws in, or `undefined` while no model
 * is loaded.
 *
 * The model owns where its head is; a consumer that draws beside the character
 * reads this rather than reaching into the internal model itself.
 */
function headAnchor() {
  const current = model.value
  if (!current)
    return undefined

  // Read the internal model off the instance rather than `internalModelRef`,
  // which the expression controller owns: it holds a value only while Live2D
  // expressions are enabled, and is cleared when they are turned off.
  const internalModel = current.internalModel

  // Pixi refreshes a local transform while it renders. A caller running ahead of
  // the render would otherwise place against the previous scale and position,
  // which is visible on the frame a resize or a fit lands on.
  current.transform.updateLocalTransform()

  const headRect = headTracker.bounds(internalModel)
  if (!headRect)
    return undefined

  return live2DCanvasRectToParent(
    headRect,
    internalModel.localTransform,
    current.transform.localTransform,
  )
}

defineExpose({
  setMotion,
  listMotionGroups,
  modelNormalizeParams,
  initialModelHeight,
  initialModelWidth,
  headAnchor,
})

import.meta.hot?.dispose(() => {
  console.warn('[Dev] Reload on HMR dispose is active for this component. Performing a full reload.')
  window.location.reload()
})
</script>

<template>
  <div ref="dropShadowColorComputer" hidden bg="primary-400 dark:primary-500" />
  <slot />
</template>
