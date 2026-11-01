<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { Filter } from '@pixi/core'
import type {
  AmbientLightEnvironment,
  AmbientLightFilterOptions,
  NormalizedRectangle,
  ScreenAmbientLightMode,
} from '@proj-airi/stage-shared/screen-ambient-light'
import type { Cubism4ModelSettings } from 'pixi-live2d-display/cubism4'

import type { Live2DFocusTarget, Live2DTouch, PixiLive2DInternalModel } from '../../../composables/live2d'
import type { Live2DExpressionControl } from '../../../controls/manifest'

import { Point } from '@pixi/math'
import { listenBeatSyncBeatSignal } from '@proj-airi/stage-shared/beat-sync'
import { ambientLightDefaults, ambientLightNeutralEnvironment, ambientLightPerceptualLevel, wholeWindowRectangle } from '@proj-airi/stage-shared/screen-ambient-light'
import { useTheme } from '@proj-airi/ui'
import { until } from '@vueuse/core'
import { animate } from 'animejs'
import { formatHex } from 'culori'
import { Mutex } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { DropShadowFilter } from 'pixi-filters'
import { Live2DFactory, Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4'
import { computed, onMounted, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'

import Live2DExpression from '../../live2d/expression.vue'

import {
  createBeatSyncController,
  createLive2DFocusBias,
  createLive2DHeadTracker,
  createLive2DMotionSpring,
  createLive2DTouchReaction,
  disableLive2DSdkBreath,
  findLive2DTouchMotionGroup,
  live2DCanvasRectToParent,
  live2DFocusTargetFromModelPoint,
  resolveLive2DFocusTargetMode,
  resolveLive2DTouchRegion,
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
  useMotionUpdatePluginTouchReaction,
} from '../../../composables/live2d'
import { useFitModel } from '../../../composables/live2d/fit-model'
import { Emotion, EmotionNeutralMotionName } from '../../../constants/emotions'
import { useLive2D } from '../../../contexts/live2d'
import { ScreenAmbientLightFilter } from '../../../filters/screen-ambient-light'
import { getLive2DMotionControlModelOffset, useL2dViewControl, useLive2DMotionControl, useLive2dParams } from '../../../stores'

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
  /** Turns a manual pose, for example a MAGIC pose, toward `focusAt` while the focus source is active. */
  focusBias?: boolean
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
  focusBias: false,
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
  exclusiveOwnerId: manualExclusiveOwnerId,
} = storeToRefs(useLive2DMotionControl())

const modelSrcRef = toRef(() => props.modelSrc)

const modelLoading = ref(false)
// NOTICE: boolean is sufficient; this flag is only used inside loadModel to bail out if the component unmounts mid-load.
let isUnmounted = false

const modelLoadMutex = new Mutex()

const manualMotionSpring = createLive2DMotionSpring()
const manualFocusBias = createLive2DFocusBias()
const touchReaction = createLive2DTouchReaction()
const manualControlOffset = computed(() => getLive2DMotionControlModelOffset(manualMotionSpring.output.value))
const offset = computed(() => ({
  x: (position.value.x / 100) * props.width + manualControlOffset.value.x,
  y: -(position.value.y / 100) * props.height + manualControlOffset.value.y,
}))

const pixiApp = toRef(() => props.app)
const paused = toRef(() => props.paused)
const focusAt = toRef(() => props.focusAt)
const model = shallowRef<Live2DModel<PixiLive2DInternalModel>>()
const initialModelWidth = ref<number>(0)
const initialModelHeight = ref<number>(0)
const mouthOpenSize = computed(() => Math.max(0, Math.min(100, props.mouthOpenSize)))
const nowSpeaking = toRef(() => props.nowSpeaking)
const lastUpdateTime = ref(0)

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

function destroyRenderedModel() {
  const renderedModel = model.value
  if (!renderedModel)
    return

  try {
    pixiApp.value?.stage?.removeChild(renderedModel)
    destroyModel(renderedModel)
  }
  catch (error) {
    console.warn('Failed to destroy the rendered Live2D model:', error)
  }
  finally {
    model.value = undefined
  }
}

const live2dStore = useLive2dParams()
const live2d = useLive2D()
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
const screenAmbientLightActive = toRef(() => props.screenAmbientLightActive)
const screenAmbientLightFilterOptions = toRef(() => props.screenAmbientLightFilterOptions)
const screenAmbientLightEnvironment = toRef(() => props.screenAmbientLightEnvironment)
const screenAmbientLightSubject = toRef(() => props.screenAmbientLightSubject)
const screenAmbientLightMode = toRef(() => props.screenAmbientLightMode)
const screenAmbientLightStrength = toRef(() => props.screenAmbientLightStrength)
const screenAmbientLightSquint = toRef(() => props.screenAmbientLightSquint)

const headTracker = createLive2DHeadTracker()
const expressionReferences = shallowRef<Live2DExpressionControl[]>([])
const expressionLoader = shallowRef<(fileName: string) => Promise<string>>()
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

// The textures sit in the global Pixi texture cache under the model's blob URLs.
// Each cached texture holds a listener into the renderer that uploaded it, so a
// texture left there keeps that renderer's WebGL context and GPU memory alive.
function destroyModel(target: Live2DModel) {
  target.destroy({ texture: true, baseTexture: true })
}

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
  const modelSource = modelSrcRef.value
  const modelId = props.modelId
  live2d.beginModelLoad()

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
  if (model.value) {
    expressionReferences.value = []
    expressionLoader.value = undefined
    destroyRenderedModel()
    headTracker.reset()
  }
  if (!modelSource) {
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

    const live2DModel = new Live2DModel<PixiLive2DInternalModel>()
    await Live2DFactory.setupLive2DModel(live2DModel, { url: modelSource, id: modelId }, { autoInteract: false })
    // The unmount hook ran while the model was loading, so it had no model to destroy.
    // A newer source also replaces this load.
    if (isUnmounted || modelSource !== modelSrcRef.value) {
      destroyModel(live2DModel)
      return
    }

    availableMotions.value.forEach((motion) => {
      if (motion.motionName in Emotion) {
        motionMap.value[motion.fileName] = motion.motionName
      }
      else {
        motionMap.value[motion.fileName] = EmotionNeutralMotionName
      }
    })

    // --- Scene

    model.value = live2DModel
    // REVIEW: pixiApp and stage are guaranteed to be valid here due to the until(...) above.
    pixiApp.value!.stage.addChild(model.value)
    initialModelWidth.value = model.value.width
    initialModelHeight.value = model.value.height
    model.value.anchor.set(0.5, 0.5)
    setScaleAndPosition()

    // --- Motion

    const internalModel = model.value.internalModel
    const coreModel = internalModel.coreModel
    const motionManager = internalModel.motionManager
    disableLive2DSdkBreath(internalModel)
    coreModel.setParameterValueById('ParamMouthOpenY', mouthOpenSize.value)

    availableMotions.value = Object
      .entries(motionManager.definitions)
      .flatMap(([motionName, definition]) => (definition?.map((motion: any, index: number) => ({
        motionName,
        motionIndex: index,
        fileName: motion.File,
      })) || []))
      .filter(Boolean)
    live2d.motions.register(availableMotions.value.map(motion => ({
      fileName: motion.fileName,
      group: motion.motionName,
      index: motion.motionIndex,
    })))
    live2d.motions.setExecutor({
      play: motion => setMotion(motion.group, motion.index),
    })

    // Check if user has selected a runtime motion to play as idle
    const selectedMotionGroup = localStorage.getItem('selected-runtime-motion-group')
    const selectedMotionIndex = localStorage.getItem('selected-runtime-motion-index')

    // Configure the selected motion to loop
    if (selectedMotionGroup !== null && selectedMotionIndex) {
      const groupIndex = (motionManager.groups as Record<string, any>)[selectedMotionGroup]
      if (groupIndex !== undefined && motionManager.motionGroups[groupIndex]) {
        const motionIndex = Number.parseInt(selectedMotionIndex)
        const motion = motionManager.motionGroups[groupIndex][motionIndex]
        if (motion && motion._looper) {
          // Force the motion to loop
          motion._looper.loopDuration = 0 // 0 means infinite loop
          console.info('Configured motion to loop infinitely:', selectedMotionGroup, motionIndex)
        }
      }
    }

    if (selectedMotionGroup !== null && selectedMotionIndex && live2dIdleAnimationEnabled.value) {
      setTimeout(() => {
        console.info('Playing selected runtime motion:', selectedMotionGroup, selectedMotionIndex)
        currentMotion.value = {
          group: selectedMotionGroup,
          index: Number.parseInt(selectedMotionIndex),
        }
      }, 300)
    }

    // Remove eye ball movements from idle motion group to prevent conflicts
    // This is too hacky
    // FIXME: it cannot blink if loading a model only have idle motion
    if (motionManager.groups.idle) {
      motionManager.motionGroups[motionManager.groups.idle]?.forEach((motion) => {
        motion._motionData.curves.forEach((curve: any) => {
        // TODO: After emotion mapper, stage editor, eye related parameters should be take cared to be dynamical instead of hardcoding
          if (curve.id === 'ParamEyeBallX' || curve.id === 'ParamEyeBallY') {
            curve.id = `_${curve.id}`
          }
        })
      })
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
      lastUpdateTime,
    })

    motionManagerUpdate.register(useMotionUpdatePluginBeatSync(beatSync), 'pre')
    motionManagerUpdate.register(useMotionUpdatePluginIdleDisable(), 'pre')
    motionManagerUpdate.register(useMotionUpdatePluginIdleFocus(), 'post')
    // Both run in 'final' stage (ignores handled state).
    // Expression first: sets desired parameter values (e.g. closed eyes = 0).
    // Blink second: reads post-expression eye values, Multiply-modulates on top.
    // This ensures blink respects expression state (0 × blinkFactor = 0).
    motionManagerUpdate.register(useMotionUpdatePluginExpression(live2d.expressions), 'final')
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
    motionManagerUpdate.register(useMotionUpdatePluginManualControl(manualMotionControl, manualMotionSpring, {
      controller: manualFocusBias,
      target: focusBiasTarget,
    }), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginLipSync(mouthOpenSize, nowSpeaking), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginBreathControl(manualBreathControl), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginTouchReaction(touchReaction.sample), 'final')

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
        // Restart the selected runtime motion at once, so the loop has no gap
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
    coreModel.setParameterValueById('ParamEyeSmile', modelParameters.value.leftEyeSmile)
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

    // --- Expression context initialisation (conditional)
    if (live2dExpressionEnabled.value) {
      // Disable built-in Cubism expression manager — the Root expression context
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
    }

    live2d.setModel(internalModel)
    emits('modelLoaded')
  }
  catch (error) {
    if (isUnmounted || modelSource !== modelSrcRef.value)
      return

    console.error('[Live2D] Failed to load model:', error)
    emits('error', error instanceof Error ? error : new Error(String(error)))
  }
  finally {
    modelLoading.value = false
    componentState.value = 'mounted'
    configureExpressions(model.value?.internalModel)
  }
}

function configureExpressions(internalModel?: PixiLive2DInternalModel) {
  const settings = internalModel?.settings as Cubism4ModelSettings | undefined
  if (!settings) {
    expressionReferences.value = []
    expressionLoader.value = undefined
    return
  }

  expressionReferences.value = (settings.expressions ?? []).map(expression => ({
    name: expression.Name,
    fileName: expression.File,
  }))
  expressionLoader.value = async (filePath: string) => {
    const resolvedUrl: string = settings.resolveURL?.(filePath) ?? filePath
    const response = await fetch(resolvedUrl)
    if (!response.ok)
      throw new Error(`Failed to fetch exp3 file: ${filePath} (${response.status})`)
    return response.text()
  }

  selectExpressionExecutor()
}

/** The Root blends expressions when the expression system is on. Otherwise the SDK manager applies them. */
function selectExpressionExecutor() {
  const sdkManager = savedExpressionManager.value
  live2d.expressions.setExecutor(live2dExpressionEnabled.value
    ? {
        activate: (name) => {
          live2d.expressions.reset()
          return live2d.expressions.activate(name)
        },
        reset: () => {
          live2d.expressions.reset()
          return true
        },
      }
    : {
        activate: name => sdkManager?.setExpression(name) ?? false,
        reset: () => {
          sdkManager?.resetExpression()
          return !!sdkManager
        },
      })
}

async function setMotion(motionName: string, index?: number) {
  // TODO: motion? Not every Live2D model has motion, we do need to help users to set motion
  if (!model.value) {
    console.warn('Cannot set motion: model not loaded')
    return false
  }

  console.info('Setting motion:', motionName, 'index:', index)
  try {
    await model.value.motion(motionName, index, MotionPriority.FORCE)
    console.info('Motion started successfully:', motionName)
    return true
  }
  catch (error) {
    console.error('Failed to start motion:', motionName, error)
    return false
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

    configureExpressions(im)
  }
  else {
    mm.expressionManager = savedExpressionManager.value
    im.eyeBlink = savedEyeBlink.value
    live2d.expressions.reset()
    selectExpressionExecutor()
  }
})

/**
 * Sets the target of the Pixi focus controller.
 *
 * Pixi keeps the last target and adds it to the head, body, and eye angles on
 * every frame. Without a reset, the model stays turned after tracking stops,
 * and the turn also adds to a MAGIC pose. `Live2DModel.focus` always puts the
 * target on the unit circle, so the center needs a direct `focus(0, 0)`.
 */
function updateFocusTarget() {
  const current = model.value
  if (!current)
    return

  const mode = resolveLive2DFocusTargetMode({
    eyeTracking: props.eyeTracking,
    sourceActive: props.eyeFocusSourceActive,
    idleEyeFocus: props.live2dForceIdleEyeAnimation,
  })
  if (mode === 'follow')
    current.focus(focusAt.value.x, focusAt.value.y)
  else if (mode === 'center')
    current.internalModel.focusController.focus(0, 0)
}

watch([model, focusAt, live2dEyeTrackingEnabled, live2dEyeFocusSourceActive, live2dForceIdleEyeAnimation], updateFocusTarget)

/**
 * The focus target that biases a manual pose in the current frame.
 *
 * A devtools window that owns the model exclusively drives the pose by hand,
 * so the bias stays off for it.
 */
// A devtools window that takes exclusive control gets the joystick pose without a fading cursor bias.
watch(manualExclusiveOwnerId, (owner) => {
  if (owner !== null)
    manualFocusBias.reset()
})

function focusBiasTarget(): Live2DFocusTarget | undefined {
  const current = model.value
  if (!current || !props.focusBias || !props.eyeFocusSourceActive || manualExclusiveOwnerId.value !== null)
    return undefined

  const internalModel = current.internalModel
  const point = current.toModelPosition(new Point(focusAt.value.x, focusAt.value.y))
  return live2DFocusTargetFromModelPoint(point, {
    width: internalModel.originalWidth,
    height: internalModel.originalHeight,
  })
}

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
  expressionReferences.value = []
  expressionLoader.value = undefined

  // Destroying a display object does not destroy its filters, and each mount
  // creates its own pair, so the light-map textures and the blur pass would
  // stay on the GPU for every renderer switch. The stack comes off the model
  // first so that nothing can reference a destroyed filter.
  if (model.value)
    model.value.filters = []
  screenAmbientLightFilter.value.destroy()
  dropShadowFilter.value.destroy()

  // The model registers on the global `Ticker.shared` when it is built, and only
  // `destroy()` removes it. Without this, each stage remount leaves the old model
  // updating every frame and holding its Cubism memory. This component unmounts
  // before the canvas, so the stage still exists here.
  destroyRenderedModel()
})

/**
 * Finds the part of the character under a point of the Pixi stage.
 *
 * Hit areas of the author come first. Most models have none, so the head box
 * of the head tracker and the bounds of the visible drawables are the fallback.
 */
function touchAt(stagePoint: { x: number, y: number }): Omit<Live2DTouch, 'gesture'> | undefined {
  const current = model.value
  if (!current)
    return undefined

  const internalModel = current.internalModel
  const point = current.toModelPosition(new Point(stagePoint.x, stagePoint.y))
  const headRect = headTracker.bounds(internalModel)
  const insideHead = !!headRect
    && point.x >= headRect.x && point.x <= headRect.x + headRect.width
    && point.y >= headRect.y && point.y <= headRect.y + headRect.height
  let insideDrawable = false
  const drawableCount = internalModel.coreModel.getDrawableCount()
  for (let index = 0; index < drawableCount && !insideDrawable; index += 1) {
    if (internalModel.coreModel.getDrawableOpacity(index) <= 0)
      continue
    const bounds = internalModel.getDrawableBounds(index)
    insideDrawable = point.x >= bounds.x && point.x <= bounds.x + bounds.width
      && point.y >= bounds.y && point.y <= bounds.y + bounds.height
  }

  const region = resolveLive2DTouchRegion({
    hitAreaNames: internalModel.hitTest(point.x, point.y),
    insideHead,
    insideDrawable,
  })
  if (!region)
    return undefined

  return {
    region,
    side: Math.min(1, Math.max(-1, point.x / internalModel.originalWidth * 2 - 1)),
  }
}

/** Plays the reaction of the model to one touch. */
function react(touch: Live2DTouch) {
  const current = model.value
  if (!current)
    return

  touchReaction.trigger(touch, performance.now() / 1000)
  // A pat repeats while the pointer strokes, so only a tap starts a model motion.
  if (touch.gesture !== 'tap')
    return

  const group = findLive2DTouchMotionGroup(Object.keys(current.internalModel.motionManager.definitions), touch.region)
  if (group)
    void current.motion(group, undefined, MotionPriority.NORMAL)
}

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
  touchAt,
  react,
})

import.meta.hot?.dispose(() => {
  console.warn('[Dev] Reload on HMR dispose is active for this component. Performing a full reload.')
  window.location.reload()
})
</script>

<template>
  <Live2DExpression
    v-for="expression in expressionReferences"
    :key="expression.name"
    :name="expression.name"
    :file-name="expression.fileName"
    :load="expressionLoader!"
  />
  <div ref="dropShadowColorComputer" hidden bg="primary-400 dark:primary-500" />
  <slot />
</template>
