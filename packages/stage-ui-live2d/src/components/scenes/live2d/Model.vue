<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { Live2DModel as PixiLive2DModel } from 'pixi-live2d-display'

import type { PixiLive2DInternalModel } from '../../../composables/live2d'

import { errorMessageFrom } from '@moeru/std'
import { listenBeatSyncBeatSignal } from '@proj-airi/stage-shared/beat-sync'
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
  resolveIdleMotionGroup,
  useExpressionController,
  useLive2DMotionManagerUpdate,
  useMotionUpdatePluginAutoEyeBlink,
  useMotionUpdatePluginBeatSync,
  useMotionUpdatePluginExpression,
  useMotionUpdatePluginIdleDisable,
  useMotionUpdatePluginIdleFocus,
  useMotionUpdatePluginLipSync,
} from '../../../composables/live2d'
import { useFitModel } from '../../../composables/live2d/fit-model'
import { Emotion, EmotionNeutralMotionName } from '../../../constants/emotions'
import { useL2dViewControl, useLive2dParams } from '../../../stores'
import { loadLive2DRuntime, setupLive2DModel } from '../../../utils/live2d-runtime'

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
})

const emits = defineEmits<{
  (e: 'modelLoaded'): void
  /**
   * Human-readable reason the model failed to load. Forwarded verbatim from the
   * thrown error so actionable loader text — such as the missing-Cubism-2-core
   * instructions raised by `utils/live2d-zip-loader.ts` — reaches the UI
   * unchanged.
   */
  (e: 'error', message: string): void
}>()

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })
const { position, scale } = useL2dViewControl()

const modelSrcRef = toRef(() => props.modelSrc)

const modelLoading = ref(false)
// NOTICE: boolean is sufficient; this flag is only used inside loadModel to bail out if the component unmounts mid-load.
let isUnmounted = false

const modelLoadMutex = new Mutex()

const offset = computed(() => ({
  x: (position.value.x / 100) * props.width,
  y: -(position.value.y / 100) * props.height,
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
const dropShadowFilter = shallowRef(new DropShadowFilter({
  alpha: 0.2,
  blur: 0,
  distance: 20,
  rotation: 45,
}))

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

// --- Expression controller
const internalModelRef = ref<PixiLive2DInternalModel>()
const expressionController = useExpressionController({
  internalModel: internalModelRef,
  modelId: props.modelId,
})
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

    try {
      pixiApp.value.stage.removeChild(model.value)
      model.value.destroy()
    }
    catch (error) {
      console.warn('Error removing old model:', error)
    }
    model.value = undefined
  }
  if (!modelSrcRef.value) {
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

    const runtime = await loadLive2DRuntime()
    const { Live2DModel, MotionPriority } = runtime
    forceMotionPriority.value = MotionPriority.FORCE
    const live2DModel = new Live2DModel<PixiLive2DInternalModel>()
    await setupLive2DModel(runtime, live2DModel, { url: modelSrcRef.value, id: props.modelId }, pixiApp.value!.renderer, { autoInteract: false })
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
    coreModel.setParameterValueById('ParamMouthOpenY', mouthOpenSize.value)

    // Point `groups.idle` at whatever this model actually ships, otherwise every
    // idle-gated plugin below treats the model as permanently non-idle.
    const detectedIdleGroup = resolveIdleMotionGroup(motionManager.definitions)
    if (detectedIdleGroup)
      motionManager.groups.idle = detectedIdleGroup

    availableMotions.value = Object
      .entries(motionManager.definitions)
      .flatMap(([motionName, definition]) => (definition?.map((motion: any, index: number) => ({
        motionName,
        motionIndex: index,
        fileName: motion.File ?? motion.file,
      })) || []))
      .filter(Boolean)

    // Must run after availableMotions is assigned above: availableMotions is
    // persisted through useLocalStorageManualReset, so mapping it any earlier
    // classifies the previously loaded model's motions (or nothing at all on a
    // first-ever run).
    availableMotions.value.forEach((motion) => {
      if (motion.motionName in Emotion) {
        motionMap.value[motion.fileName] = motion.motionName
      }
      else {
        motionMap.value[motion.fileName] = EmotionNeutralMotionName
      }
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
    // The rest run in the 'final' stage, which ignores the handled state.
    // Idle focus first: it must land after the SDK motion update to override an
    // idle motion's own eyeball curves, but before expression so an expression
    // targeting eye-ball parameters still wins.
    // Expression next: sets desired parameter values (e.g. closed eyes = 0).
    // Blink after: reads post-expression eye values, Multiply-modulates on top.
    // This ensures blink respects expression state (0 × blinkFactor = 0).
    motionManagerUpdate.register(useMotionUpdatePluginIdleFocus(), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginExpression(expressionController), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginAutoEyeBlink(live2dExpressionEnabled), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginLipSync(mouthOpenSize, nowSpeaking), 'final')

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

    // Apply all stored parameters to the model
    coreModel.setParameterValueById('ParamAngleX', modelParameters.value.angleX)
    coreModel.setParameterValueById('ParamAngleY', modelParameters.value.angleY)
    coreModel.setParameterValueById('ParamAngleZ', modelParameters.value.angleZ)
    coreModel.setParameterValueById('ParamEyeLOpen', modelParameters.value.leftEyeOpen)
    coreModel.setParameterValueById('ParamEyeROpen', modelParameters.value.rightEyeOpen)
    coreModel.setParameterValueById('ParamEyeLSmile', modelParameters.value.leftEyeSmile)
    coreModel.setParameterValueById('ParamEyeRSmile', modelParameters.value.rightEyeSmile)
    coreModel.setParameterValueById('ParamBrowLX', modelParameters.value.leftEyebrowLR)
    coreModel.setParameterValueById('ParamBrowRX', modelParameters.value.rightEyebrowLR)
    coreModel.setParameterValueById('ParamBrowLY', modelParameters.value.leftEyebrowY)
    coreModel.setParameterValueById('ParamBrowRY', modelParameters.value.rightEyebrowY)
    coreModel.setParameterValueById('ParamBrowLAngle', modelParameters.value.leftEyebrowAngle)
    coreModel.setParameterValueById('ParamBrowRAngle', modelParameters.value.rightEyebrowAngle)
    coreModel.setParameterValueById('ParamBrowLForm', modelParameters.value.leftEyebrowForm)
    coreModel.setParameterValueById('ParamBrowRForm', modelParameters.value.rightEyebrowForm)
    coreModel.setParameterValueById('ParamMouthOpenY', modelParameters.value.mouthOpen)
    coreModel.setParameterValueById('ParamMouthForm', modelParameters.value.mouthForm)
    coreModel.setParameterValueById('ParamCheek', modelParameters.value.cheek)
    coreModel.setParameterValueById('ParamBodyAngleX', modelParameters.value.bodyAngleX)
    coreModel.setParameterValueById('ParamBodyAngleY', modelParameters.value.bodyAngleY)
    coreModel.setParameterValueById('ParamBodyAngleZ', modelParameters.value.bodyAngleZ)
    coreModel.setParameterValueById('ParamBreath', modelParameters.value.breath)

    // Save SDK manager references so they can be restored if expression is
    // toggled off at runtime.
    savedEyeBlink.value = internalModel.eyeBlink
    savedExpressionManager.value = motionManager.expressionManager

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
    emits('error', errorMessageFrom(error) ?? 'Failed to load the Live2D model.')
  }
  finally {
    modelLoading.value = false
    componentState.value = 'mounted'
    await initExpressionController(internalModelRef.value).catch((err) => {
      console.warn('[Model.vue] Expression controller initialization failed:', err)
    })
    modelLoadMutex.release()
  }
}

/**
 * Initialise the expression controller by reading expression definitions from
 * the model settings and parsing each referenced expression file. Both
 * generations are covered: Cubism 2 declares `expressions` in `model.json` and
 * ships `.exp.json`, Cubism 3+ declares them in `model3.json` and ships
 * `.exp3.json`; the parsed payloads share the same shape.
 *
 * This is intentionally fire-and-forget from loadModel so that a failure in
 * expression loading does not prevent the model itself from rendering.
 */
async function initExpressionController(internalModel?: PixiLive2DInternalModel) {
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

  await expressionController.initialise(expressionRefs, readExpFile)
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

/**
 * Attaches or detaches the drop shadow filter on the current model.
 *
 * Kept separate from {@link updateDropShadowColor} because assigning `filters`
 * rebuilds PIXI's filter chain for the display object, which forces the Live2D
 * model to be re-rendered through a fresh set of framebuffer-backed render
 * textures. The dynamic-theme loop below runs every frame and only ever needs to
 * retint the filter already in place.
 */
function syncDropShadowFilter() {
  if (!model.value)
    return

  model.value.filters = live2dShadowEnabled.value ? [dropShadowFilter.value] : []
}

/**
 * Retints the filter from the hidden probe element, which resolves the current
 * theme's primary color through UnoCSS rather than duplicating it in script.
 */
function updateDropShadowColor() {
  if (!dropShadowColorComputer.value)
    return

  const color = getComputedStyle(dropShadowColorComputer.value).backgroundColor
  dropShadowFilter.value.color = Number(formatHex(color)!.replace('#', '0x'))
}

watch(modelSrcRef, async () => await loadModel(), { immediate: true })
watch([dark, themeColorsHue], updateDropShadowColor, { immediate: true })
watch([model, live2dShadowEnabled], syncDropShadowFilter)

function updateDropShadowFilterLoop() {
  updateDropShadowColor()
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

// Watch and apply model parameters
watch(() => modelParameters.value.angleX, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamAngleX', value)
  }
})

watch(() => modelParameters.value.angleY, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamAngleY', value)
  }
})

watch(() => modelParameters.value.angleZ, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamAngleZ', value)
  }
})

watch(() => modelParameters.value.leftEyeOpen, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamEyeLOpen', value)
  }
})

watch(() => modelParameters.value.rightEyeOpen, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamEyeROpen', value)
  }
})

watch(() => modelParameters.value.leftEyeSmile, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamEyeLSmile', value)
  }
})

watch(() => modelParameters.value.rightEyeSmile, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamEyeRSmile', value)
  }
})

watch(() => modelParameters.value.mouthOpen, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamMouthOpenY', value)
  }
})

watch(() => modelParameters.value.mouthForm, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamMouthForm', value)
  }
})

watch(() => modelParameters.value.cheek, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamCheek', value)
  }
})

watch(() => modelParameters.value.bodyAngleX, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBodyAngleX', value)
  }
})

watch(() => modelParameters.value.bodyAngleY, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBodyAngleY', value)
  }
})

watch(() => modelParameters.value.bodyAngleZ, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBodyAngleZ', value)
  }
})

watch(() => modelParameters.value.breath, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBreath', value)
  }
})

// Watch eyebrow parameters
watch(() => modelParameters.value.leftEyebrowLR, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBrowLX', value)
  }
})

watch(() => modelParameters.value.rightEyebrowLR, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBrowRX', value)
  }
})

watch(() => modelParameters.value.leftEyebrowY, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBrowLY', value)
  }
})

watch(() => modelParameters.value.rightEyebrowY, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBrowRY', value)
  }
})

watch(() => modelParameters.value.leftEyebrowAngle, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBrowLAngle', value)
  }
})

watch(() => modelParameters.value.rightEyebrowAngle, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBrowRAngle', value)
  }
})

watch(() => modelParameters.value.leftEyebrowForm, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBrowLForm', value)
  }
})

watch(() => modelParameters.value.rightEyebrowForm, (value) => {
  if (model.value) {
    const internalModel = model.value.internalModel
    internalModel.coreModel.setParameterValueById('ParamBrowRForm', value)
  }
})

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
    initExpressionController(im).catch((err) => {
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

onMounted(() => {
  updateDropShadowColor()
  syncDropShadowFilter()
})

onUnmounted(() => {
  isUnmounted = true
  resizeAnimation?.pause()
  disposeShouldUpdateView?.()
  expressionController.dispose()
})

function listMotionGroups() {
  return availableMotions.value
}

defineExpose({
  setMotion,
  listMotionGroups,
  modelNormalizeParams,
  initialModelHeight,
  initialModelWidth,
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
