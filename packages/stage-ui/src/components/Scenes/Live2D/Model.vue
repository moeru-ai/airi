<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { Cubism4InternalModel, InternalModel } from 'pixi-live2d-display/cubism4'

import { breakpointsTailwind, until, useBreakpoints, useDark, useDebounceFn } from '@vueuse/core'
import { formatHex } from 'culori'
import { storeToRefs } from 'pinia'
import { DropShadowFilter } from 'pixi-filters'
import { Live2DFactory, Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4'
import { computed, onMounted, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'

import { useLive2DIdleEyeFocus } from '../../../composables/live2d'
import { Emotion, EmotionNeutralMotionName } from '../../../constants/emotions'
import { useLive2d } from '../../../stores/live2d'
import { useSettings } from '../../../stores/settings'

type CubismModel = Cubism4InternalModel['coreModel']
type CubismEyeBlink = Cubism4InternalModel['eyeBlink']
type PixiLive2DInternalModel = InternalModel & {
  eyeBlink?: CubismEyeBlink
  coreModel: CubismModel
}

const props = withDefaults(defineProps<{
  modelSrc?: string

  app?: Application
  mouthOpenSize?: number
  width: number
  height: number
  paused?: boolean
  focusAt?: { x: number, y: number }
  disableFocusAt?: boolean
  xOffset?: number | string
  yOffset?: number | string
  scale?: number
}>(), {
  mouthOpenSize: 0,
  paused: false,
  focusAt: () => ({ x: 0, y: 0 }),
  disableFocusAt: false,
  scale: 1,
})

const emits = defineEmits<{
  (e: 'modelLoaded'): void
}>()

function parsePropsOffset() {
  let xOffset = Number.parseFloat(String(props.xOffset)) || 0
  let yOffset = Number.parseFloat(String(props.yOffset)) || 0

  if (String(props.xOffset).endsWith('%')) {
    xOffset = (Number.parseFloat(String(props.xOffset).replace('%', '')) / 100) * props.width
  }
  if (String(props.yOffset).endsWith('%')) {
    yOffset = (Number.parseFloat(String(props.yOffset).replace('%', '')) / 100) * props.height
  }

  return {
    xOffset,
    yOffset,
  }
}

const modelSrcRef = toRef(() => props.modelSrc)

const modelLoading = ref(false)

const offset = computed(() => parsePropsOffset())

const pixiApp = toRef(() => props.app)
const paused = toRef(() => props.paused)
const focusAt = toRef(() => props.focusAt)
const model = ref<Live2DModel<PixiLive2DInternalModel>>()
const initialModelWidth = ref<number>(0)
const initialModelHeight = ref<number>(0)
const mouthOpenSize = computed(() => Math.max(0, Math.min(100, props.mouthOpenSize)))
const lastUpdateTime = ref(0)

const dark = useDark()
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = computed(() => breakpoints.between('sm', 'md').value || breakpoints.smaller('sm').value)
const idleEyeFocus = useLive2DIdleEyeFocus()
const dropShadowFilter = shallowRef(new DropShadowFilter({
  alpha: 0.2,
  blur: 0,
  distance: 20,
  rotation: 45,
}))

function getCoreModel() {
  return model.value!.internalModel.coreModel as any
}

function setScaleAndPosition() {
  if (!model.value)
    return

  let offsetFactor = 2.2
  if (isMobile.value) {
    offsetFactor = 2.2
  }

  const heightScale = (props.height * 0.95 / initialModelHeight.value * offsetFactor)
  const widthScale = (props.width * 0.95 / initialModelWidth.value * offsetFactor)
  const scale = Math.min(heightScale, widthScale)

  model.value.scale.set(scale * props.scale, scale * props.scale)

  model.value.x = (props.width / 2) + offset.value.xOffset
  model.value.y = props.height + offset.value.yOffset
}

const {
  currentMotion,
  availableMotions,
  motionMap,
} = storeToRefs(useLive2d())

const {
  themeColorsHue,
  themeColorsHueDynamic,
} = storeToRefs(useSettings())

const localCurrentMotion = ref<{ group: string, index: number }>({ group: 'Idle', index: 0 })

async function loadModel() {
  await until(modelLoading).not.toBeTruthy()

  modelLoading.value = true

  if (!pixiApp.value) {
    modelLoading.value = false
    return
  }

  if (model.value) {
    pixiApp.value.stage.removeChild(model.value)
    model.value.destroy()
    model.value = undefined
  }
  if (!modelSrcRef.value) {
    console.warn('No Live2D model source provided.')
    modelLoading.value = false
    return
  }

  try {
    const modelInstance = new Live2DModel<PixiLive2DInternalModel>()
    if (modelSrcRef.value.startsWith('blob:')) {
      const res = await fetch(modelSrcRef.value)
      const blob = await res.blob()
      await Live2DFactory.setupLive2DModel(modelInstance, [new File([blob], 'model.zip')], { autoInteract: false })
    }
    else {
      await Live2DFactory.setupLive2DModel(modelInstance, modelSrcRef.value, { autoInteract: false })
    }

    availableMotions.value.forEach((motion) => {
      if (motion.motionName in Emotion) {
        motionMap.value[motion.fileName] = motion.motionName
      }
      else {
        motionMap.value[motion.fileName] = EmotionNeutralMotionName
      }
    })

    model.value = modelInstance
    pixiApp.value.stage.addChild(model.value)
    initialModelWidth.value = model.value.width
    initialModelHeight.value = model.value.height
    model.value.anchor.set(0.5, 0.5)
    setScaleAndPosition()

    model.value.on('hit', (hitAreas) => {
      if (model.value && hitAreas.includes('body'))
        model.value.motion('tap_body')
    })

    const internalModel = model.value.internalModel
    const coreModel = internalModel.coreModel
    const motionManager = internalModel.motionManager
    coreModel.setParameterValueById('ParamMouthOpenY', mouthOpenSize.value)

    availableMotions.value = Object.entries(motionManager.definitions).flatMap(([motionName, definition]) => {
      if (!definition)
        return []

      return definition.map((motion: any, index: number) => ({
        motionName,
        motionIndex: index,
        fileName: motion.File,
      }))
    }).filter(Boolean)

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
    const hookedUpdate = motionManager.update as (model: CubismModel, now: number) => boolean
    motionManager.update = function (model: CubismModel, now: number) {
      lastUpdateTime.value = now

      hookedUpdate?.call(this, model, now)
      // Possibility 1: Only update eye focus when the model is idle
      // Possibility 2: For models having no motion groups, currentGroup will be undefined while groups can be { idle: ... }
      if (!motionManager.state.currentGroup || motionManager.state.currentGroup === motionManager.groups.idle) {
        idleEyeFocus.update(internalModel, now)

        // If the model has eye blink parameters
        if (internalModel.eyeBlink != null) {
        // For the part of the auto eye blink implementation in pixi-live2d-display
        //
        // this.emit("beforeMotionUpdate");
        // const motionUpdated = this.motionManager.update(this.coreModel, now);
        // this.emit("afterMotionUpdate");
        // model.saveParameters();
        // this.motionManager.expressionManager?.update(model, now);
        // if (!motionUpdated) {
        //   this.eyeBlink?.updateParameters(model, dt);
        // }
        //
        // https://github.com/guansss/pixi-live2d-display/blob/31317b37d5e22955a44d5b11f37f421e94a11269/src/cubism4/Cubism4InternalModel.ts#L202-L214
        //
        // If the this.motionManager.update returns true, as motion updated flag on,
        // the eye blink parameters will not be updated, in another hand, the auto eye blink is disabled
        //
        // Since we are hooking the motionManager.update method currently,
        // and previously a always `true` was returned, eye blink parameters were never updated.
        //
        // Thous we are here to manually update the eye blink parameters within this hooked method
          internalModel.eyeBlink.updateParameters(model, (now - lastUpdateTime.value) / 1000)
        }

        // still, mark the motion as updated
        return true
      }

      return false
    }

    motionManager.on('motionStart', (group, index) => {
      localCurrentMotion.value = { group, index }
    })

    emits('modelLoaded')
  }
  finally {
    modelLoading.value = false
  }
}

async function setMotion(motionName: string, index?: number) {
  // TODO: motion? Not every Live2D model has motion, we do need to help users to set motion
  await model.value?.motion(motionName, index, MotionPriority.FORCE)
}

const handleResize = useDebounceFn(setScaleAndPosition, 100)

const dropShadowColorComputer = ref<HTMLDivElement>()
const dropShadowAnimationId = ref(0)

function updateDropShadowFilter() {
  if (model.value) {
    const color = getComputedStyle(dropShadowColorComputer.value!).backgroundColor
    dropShadowFilter.value.color = Number(formatHex(color)!.replace('#', '0x'))
    model.value.filters = [dropShadowFilter.value]
  }
}

watch([() => props.width, () => props.height], () => handleResize())
watch(modelSrcRef, async () => await loadModel(), { immediate: true })
watch(dark, updateDropShadowFilter, { immediate: true })
watch([model, themeColorsHue], updateDropShadowFilter)
watch(offset, setScaleAndPosition)
watch(() => props.scale, setScaleAndPosition)

// TODO: This is hacky!
function updateDropShadowFilterLoop() {
  updateDropShadowFilter()
  dropShadowAnimationId.value = requestAnimationFrame(updateDropShadowFilterLoop)
}

watch(themeColorsHueDynamic, () => {
  if (themeColorsHueDynamic.value) {
    dropShadowAnimationId.value = requestAnimationFrame(updateDropShadowFilterLoop)
  }
  else {
    cancelAnimationFrame(dropShadowAnimationId.value)
    dropShadowAnimationId.value = 0
  }
}, { immediate: true })

watch(mouthOpenSize, value => getCoreModel().setParameterValueById('ParamMouthOpenY', value))
watch(currentMotion, value => setMotion(value.group, value.index))
watch(paused, value => value ? pixiApp.value?.stop() : pixiApp.value?.start())

watch(focusAt, (value) => {
  if (!model.value)
    return
  if (props.disableFocusAt)
    return

  model.value.focus(value.x, value.y)
})

onMounted(async () => {
  updateDropShadowFilter()
})

function componentCleanUp() {
  cancelAnimationFrame(dropShadowAnimationId.value)
  model.value && pixiApp.value?.stage.removeChild(model.value)
}
onUnmounted(() => {
  componentCleanUp()
})

function listMotionGroups() {
  return availableMotions.value
}

defineExpose({
  setMotion,
  listMotionGroups,
})

if (import.meta.hot) {
  // Ensure cleanup on HMR
  import.meta.hot.dispose(() => {
    componentCleanUp()
  })
}
</script>

<template>
  <div ref="dropShadowColorComputer" hidden bg="primary-400 dark:primary-500" />
  <slot />
</template>
