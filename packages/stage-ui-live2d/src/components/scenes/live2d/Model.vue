<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { Cubism4ModelSettings } from 'pixi-live2d-display/cubism4'

import type { PixiLive2DInternalModel } from '../../../composables/live2d'
import type { Live2DExpressionControl } from '../../../controls/manifest'

import { listenBeatSyncBeatSignal } from '@proj-airi/stage-shared/beat-sync'
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
  createLive2DMotionSpring,
  disableLive2DSdkBreath,
  useLive2DMotionManagerUpdate,
  useMotionUpdatePluginAutoEyeBlink,
  useMotionUpdatePluginBeatSync,
  useMotionUpdatePluginBreathControl,
  useMotionUpdatePluginExpression,
  useMotionUpdatePluginIdleDisable,
  useMotionUpdatePluginIdleFocus,
  useMotionUpdatePluginLipSync,
  useMotionUpdatePluginManualControl,
} from '../../../composables/live2d'
import { useFitModel } from '../../../composables/live2d/fit-model'
import { Emotion, EmotionNeutralMotionName } from '../../../constants/emotions'
import { useLive2D } from '../../../contexts/live2d'
import { getLive2DMotionControlModelOffset, useL2dViewControl, useLive2DMotionControl, useLive2dParams } from '../../../stores'

const props = withDefaults(defineProps<{
  modelSrc?: string
  modelId?: string
  revision?: number

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
  enabledIdleAnimation?: boolean
  enabledForceIdleEyeAnimation?: boolean
  enabledAutoBlink?: boolean
  enabledForceAutoBlink?: boolean
  enabledExpression?: boolean
  enabledShadow?: boolean
}>(), {
  mouthOpenSize: 0,
  revision: 0,
  nowSpeaking: false,
  paused: false,
  focusAt: () => ({ x: 0, y: 0 }),
  eyeTracking: false,
  eyeFocusSourceActive: false,
  disableFocusAt: false,
  scale: 1,
  themeColorsHue: 220.44,
  themeColorsHueDynamic: false,
  enabledIdleAnimation: true,
  enabledForceIdleEyeAnimation: true,
  enabledAutoBlink: true,
  enabledForceAutoBlink: false,
  enabledExpression: true,
  enabledShadow: true,
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
const model = shallowRef<Live2DModel<PixiLive2DInternalModel>>()
const initialModelWidth = ref<number>(0)
const initialModelHeight = ref<number>(0)
const mouthOpenSize = computed(() => Math.max(0, Math.min(100, props.mouthOpenSize)))
const nowSpeaking = toRef(() => props.nowSpeaking)
const lastUpdateTime = ref(0)

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

function destroyRenderedModel() {
  const renderedModel = model.value
  if (!renderedModel)
    return

  try {
    pixiApp.value?.stage?.removeChild(renderedModel)
    renderedModel.destroy()
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
const enabledIdleAnimation = toRef(() => props.enabledIdleAnimation)
const enabledEyeTracking = toRef(() => props.eyeTracking)
const activeEyeFocusSource = toRef(() => props.eyeFocusSourceActive)
const enabledForceIdleEyeAnimation = toRef(() => props.enabledForceIdleEyeAnimation)
const enabledAutoBlink = toRef(() => props.enabledAutoBlink)
const enabledForceAutoBlink = toRef(() => props.enabledForceAutoBlink)
const enabledExpression = toRef(() => props.enabledExpression)
const enabledShadow = toRef(() => props.enabledShadow)

const internalModelRef = shallowRef<PixiLive2DInternalModel>()
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
  const runtimeModelId = modelId ?? modelSource ?? 'unknown'
  live2d.beginModelLoad(runtimeModelId)

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
    internalModelRef.value = undefined
    destroyRenderedModel()
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
    if (isUnmounted || modelSource !== modelSrcRef.value || modelId !== props.modelId) {
      live2DModel.destroy()
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

    const expressionRefs = (internalModel.settings as Cubism4ModelSettings).expressions ?? []
    expressionReferences.value = expressionRefs.map(expression => ({
      name: expression.Name,
      fileName: expression.File,
    }))
    const sdkExpressionManager = motionManager.expressionManager
    live2d.expressions.setExecutor({
      activate: name => sdkExpressionManager?.setExpression(name) ?? false,
      reset: () => {
        if (!sdkExpressionManager)
          return false

        sdkExpressionManager.resetExpression()
        return true
      },
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

    if (selectedMotionGroup !== null && selectedMotionIndex && enabledIdleAnimation.value) {
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
      enabledEyeTracking,
      activeEyeFocusSource,
      enabledIdleAnimation,
      enabledForceIdleEyeAnimation,
      enabledAutoBlink,
      enabledForceAutoBlink,
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
    motionManagerUpdate.register(useMotionUpdatePluginAutoEyeBlink(enabledExpression), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginLipSync(mouthOpenSize, nowSpeaking), 'final')
    motionManagerUpdate.register(useMotionUpdatePluginManualControl(manualMotionControl, manualMotionSpring), 'final')
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

      if (selectedMotionGroup !== null && selectedMotionIndex && enabledIdleAnimation.value) {
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
    if (enabledExpression.value) {
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

      internalModelRef.value = internalModel
    }

    live2d.setModel(live2DModel, internalModel)
    emits('modelLoaded')
  }
  catch (error) {
    if (isUnmounted || modelSource !== modelSrcRef.value || modelId !== props.modelId)
      return

    console.error('[Live2D] Failed to load model:', error)
    live2d.reportError('model', error)
    const reportedError = live2d.error.value?.cause
    if (reportedError)
      emits('error', reportedError)
  }
  finally {
    modelLoading.value = false
    componentState.value = 'mounted'
    configureExpressions(internalModelRef.value)
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

  if (enabledExpression.value) {
    live2d.expressions.setExecutor({
      activate: (name) => {
        live2d.expressions.reset()
        return live2d.expressions.activate(name).success
      },
      reset: () => live2d.expressions.reset().success,
    })
  }
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
    live2d.reportError('motion', error)
    return false
  }
}

const dropShadowColorComputer = ref<HTMLDivElement>()
const dropShadowAnimationId = ref(0)

function updateDropShadowFilter() {
  if (!model.value)
    return

  if (!enabledShadow.value) {
    model.value.filters = []
    return
  }

  if (!dropShadowColorComputer.value)
    return

  const color = getComputedStyle(dropShadowColorComputer.value).backgroundColor
  dropShadowFilter.value.color = Number(formatHex(color)!.replace('#', '0x'))
  model.value.filters = [dropShadowFilter.value]
}

watch([modelSrcRef, () => props.revision], async () => await loadModel(), { immediate: true })
watch(dark, updateDropShadowFilter, { immediate: true })
watch([model, themeColorsHue], updateDropShadowFilter)
watch(enabledShadow, updateDropShadowFilter)

// TODO: This is hacky!
function updateDropShadowFilterLoop() {
  updateDropShadowFilter()
  if (!enabledShadow.value) {
    dropShadowAnimationId.value = 0
    return
  }

  dropShadowAnimationId.value = requestAnimationFrame(updateDropShadowFilterLoop)
}

watch([themeColorsHueDynamic, enabledShadow], ([dynamic, shadowEnabled]) => {
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
watch(enabledIdleAnimation, (enabled) => {
  if (!enabled && model.value) {
    const internalModel = model.value.internalModel
    if (internalModel?.motionManager) {
      internalModel.motionManager.stopAllMotions()
    }
  }
})

// Watch for expression system toggle — nullify/restore SDK managers at runtime
watch(enabledExpression, (enabled) => {
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
    configureExpressions(im)
  }
  else {
    mm.expressionManager = savedExpressionManager.value
    im.eyeBlink = savedEyeBlink.value
    live2d.expressions.reset()
    internalModelRef.value = undefined
    live2d.expressions.setExecutor({
      activate: name => savedExpressionManager.value?.setExpression(name) ?? false,
      reset: () => {
        if (!savedExpressionManager.value)
          return false

        savedExpressionManager.value.resetExpression()
        return true
      },
    })
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
  updateDropShadowFilter()
})

onUnmounted(() => {
  isUnmounted = true
  resizeAnimation?.pause()
  disposeShouldUpdateView?.()
  expressionReferences.value = []
  expressionLoader.value = undefined
  destroyRenderedModel()
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
