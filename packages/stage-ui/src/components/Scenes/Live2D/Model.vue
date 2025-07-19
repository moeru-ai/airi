<script setup lang="ts">
import type { Application } from '@pixi/app'

import localforage from 'localforage'

import { extensions } from '@pixi/extensions'
import { InteractionManager } from '@pixi/interaction'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { breakpointsTailwind, useBreakpoints, useDark, useDebounceFn, watchDebounced } from '@vueuse/core'
import { formatHex } from 'culori'
import { storeToRefs } from 'pinia'
import { DropShadowFilter } from 'pixi-filters'
import { Live2DFactory, Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4'
import { computed, onMounted, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'

import { useLive2DIdleEyeFocus } from '../../../composables/live2d'
import { useLive2d, useSettings } from '../../../stores'

const props = withDefaults(defineProps<{
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
  disableFocusAt: useSettings().live2dDisableFocus,
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

const offset = computed(() => parsePropsOffset())

const pixiApp = toRef(() => props.app)
const paused = toRef(() => props.paused)
const focusAt = toRef(() => props.focusAt)
const model = ref<Live2DModel>()
const initialModelWidth = ref<number>(0)
const initialModelHeight = ref<number>(0)
const mouthOpenSize = computed(() => Math.max(0, Math.min(100, props.mouthOpenSize)))

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
  modelFile,
  loadingModel,
  currentMotion,
  availableMotions,
  loadSource,
  modelUrl,
} = storeToRefs(useLive2d())

const {
  themeColorsHue,
  themeColorsHueDynamic,
} = storeToRefs(useSettings())

const localCurrentMotion = ref<{ group: string, index: number }>({ group: 'Idle', index: 0 })

async function loadModel() {
  if (!pixiApp.value)
    return

  if (model.value) {
    pixiApp.value.stage.removeChild(model.value)
    model.value.destroy()
    model.value = undefined
  }

  const modelInstance = new Live2DModel()

  if (loadSource.value === 'file') {
    await Live2DFactory.setupLive2DModel(modelInstance, [modelFile.value], { autoInteract: false })
  }
  else if (loadSource.value === 'url') {
    await Live2DFactory.setupLive2DModel(modelInstance, modelUrl.value, { autoInteract: false })
  }

  model.value = modelInstance
  pixiApp.value.stage.addChild(model.value as any)
  initialModelWidth.value = model.value.width
  initialModelHeight.value = model.value.height

  model.value.anchor.set(0.5, 0.5)
  setScaleAndPosition()

  model.value.on('hit', (hitAreas) => {
    if (model.value && hitAreas.includes('body'))
      model.value.motion('tap_body')
  })

  const internalModel = model.value.internalModel
  const coreModel = internalModel.coreModel as any
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
  const hookedUpdate = motionManager.update
  motionManager.update = function (model, now) {
    hookedUpdate?.call(this, model, now)
    // Only update eye focus when the model is idle
    if (motionManager.state.currentGroup === motionManager.groups.idle) {
      idleEyeFocus.update(internalModel, now)
    }

    return true
  }

  motionManager.on('motionStart', (group, index) => {
    localCurrentMotion.value = { group, index }
  })

  // save to indexdb
  if (modelFile.value) {
    await localforage.setItem('live2dModel', modelFile.value)
  }

  emits('modelLoaded')
  loadingModel.value = false
}

async function initLive2DPixiStage() {
  if (!pixiApp.value)
    return

  // https://guansss.github.io/pixi-live2d-display/#package-importing
  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)
  extensions.add(InteractionManager)

  // load indexdb model first
  const live2dModelFromIndexedDB = await localforage.getItem<File>('live2dModel')
  if (live2dModelFromIndexedDB) {
    modelFile.value = live2dModelFromIndexedDB
    loadSource.value = 'file'
    loadingModel.value = true
    return
  }

  if (modelUrl.value) {
    loadSource.value = 'url'
    loadingModel.value = true
    return
  }

  loadingModel.value = false
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
watch(pixiApp, initLive2DPixiStage)
watch(currentMotion, value => setMotion(value.group, value.index))
watch(paused, value => value ? pixiApp.value?.stop() : pixiApp.value?.start())

watch(focusAt, (value) => {
  if (!model.value)
    return
  if (props.disableFocusAt)
    return

  model.value.focus(value.x, value.y)
})

watchDebounced(loadingModel, (value) => {
  if (!value)
    return

  loadModel()
}, { debounce: 1000 })

onMounted(updateDropShadowFilter)
onUnmounted(() => {
  cancelAnimationFrame(dropShadowAnimationId.value)
  model.value && pixiApp.value?.stage.removeChild(model.value)
})

function listMotionGroups() {
  return availableMotions.value
}

defineExpose({
  setMotion,
  listMotionGroups,
})
</script>

<template>
  <div ref="dropShadowColorComputer" hidden bg="primary-400 dark:primary-500" />
  <slot />
</template>
