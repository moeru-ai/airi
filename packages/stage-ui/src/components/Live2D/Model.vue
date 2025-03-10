<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { InternalModel } from 'pixi-live2d-display/cubism4'
import type { Ref } from 'vue'

import { extensions } from '@pixi/extensions'
import { InteractionManager } from '@pixi/interaction'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { breakpointsTailwind, useBreakpoints, useDark, useDebounceFn, watchDebounced } from '@vueuse/core'
import { formatHex } from 'culori'
import localforage from 'localforage'
import { storeToRefs } from 'pinia'
import { DropShadowFilter } from 'pixi-filters'
import { Live2DFactory, Live2DModel, MotionPriority } from 'pixi-live2d-display/cubism4'
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'

import { useLive2DIdleEyeFocus } from '../../composables/live2d'
import { useSettings } from '../../stores'

const props = withDefaults(defineProps<{
  app?: Application
  mouthOpenSize?: number
  width: number
  height: number
  paused: boolean
}>(), {
  mouthOpenSize: 0,
})

const pixiApp = toRef(() => props.app)
const paused = toRef(() => props.paused)
const model = ref<Live2DModel>()
const initialModelWidth = ref<number>(0)
const initialModelHeight = ref<number>(0)
const mouthOpenSize = computed(() => Math.max(0, Math.min(100, props.mouthOpenSize)))

const dark = useDark()
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = computed(() => breakpoints.between('sm', 'md').value || breakpoints.smaller('sm').value)
const idleEyeFocus = useLive2DIdleEyeFocus()
const dropShadowFilter = ref(new DropShadowFilter({
  alpha: 0.2,
  blur: 0,
  distance: 20,
  rotation: 45,
}))

function getCoreModel() {
  return model.value!.internalModel.coreModel as any
}

function setScale(model: Ref<Live2DModel<InternalModel> | undefined>) {
  if (!model.value)
    return

  let offsetFactor = 2.2
  if (isMobile.value) {
    offsetFactor = 2.2
  }

  const heightScale = props.height * 0.95 / initialModelHeight.value * offsetFactor
  const widthScale = props.width * 0.95 / initialModelWidth.value * offsetFactor
  const scale = Math.min(heightScale, widthScale)

  model.value.scale.set(scale, scale)
}

const {
  live2dModelFile,
  loadingLive2dModel,
  live2dCurrentMotion,
  availableLive2dMotions,
  live2dLoadSource,
  live2dModelUrl,
  themeColorsHue,
  themeColorsHueDynamic,
} = storeToRefs(useSettings())
const currentMotion = ref<{ group: string, index: number }>({ group: 'Idle', index: 0 })

async function loadModel() {
  if (!pixiApp.value)
    return

  if (model.value) {
    pixiApp.value.stage.removeChild(model.value)
    model.value.destroy()
    model.value = undefined
  }

  const modelInstance = new Live2DModel()

  if (live2dLoadSource.value === 'file') {
    await Live2DFactory.setupLive2DModel(modelInstance, [live2dModelFile.value])
  }
  else if (live2dLoadSource.value === 'url') {
    await Live2DFactory.setupLive2DModel(modelInstance, live2dModelUrl.value)
  }

  model.value = modelInstance
  pixiApp.value.stage.addChild(model.value as any)
  initialModelWidth.value = model.value.width
  initialModelHeight.value = model.value.height

  model.value.x = props.width / 2
  model.value.y = props.height
  model.value.rotation = Math.PI
  model.value.skew.x = Math.PI
  model.value.anchor.set(0.5, 0.5)
  setScale(model)

  model.value.on('hit', (hitAreas) => {
    if (model.value && hitAreas.includes('body'))
      model.value.motion('tap_body')
  })

  const internalModel = model.value.internalModel
  const coreModel = internalModel.coreModel as any
  const motionManager = internalModel.motionManager
  coreModel.setParameterValueById('ParamMouthOpenY', mouthOpenSize.value)

  availableLive2dMotions.value = Object.entries(motionManager.definitions).flatMap(([motionName, definition]) => {
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
    currentMotion.value = { group, index }
  })

  // save to indexdb
  if (live2dModelFile.value) {
    await localforage.setItem('live2dModel', live2dModelFile.value)
  }

  loadingLive2dModel.value = false
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
    live2dModelFile.value = live2dModelFromIndexedDB
    live2dLoadSource.value = 'file'
    loadingLive2dModel.value = true
    return
  }

  if (live2dModelUrl.value) {
    live2dLoadSource.value = 'url'
    loadingLive2dModel.value = true
    return
  }

  loadingLive2dModel.value = false
}

async function setMotion(motionName: string, index?: number) {
  await model.value!.motion(motionName, index, MotionPriority.FORCE)
}

const handleResize = useDebounceFn(() => {
  if (model.value) {
    model.value.x = props.width / 2
    model.value.y = props.height
    setScale(model)
  }
}, 100)

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
watch(live2dCurrentMotion, value => setMotion(value.group, value.index))
watch(paused, (value) => {
  value ? pixiApp.value?.stop() : pixiApp.value?.start()
})

watchDebounced(loadingLive2dModel, (value) => {
  if (!value)
    return

  loadModel()
}, { debounce: 1000 })

onMounted(updateDropShadowFilter)
onUnmounted(() => {
  cancelAnimationFrame(dropShadowAnimationId.value)
  model.value && pixiApp.value?.stage.removeChild(model.value)
})
</script>

<template>
  <div ref="dropShadowColorComputer" hidden bg="primary-400 dark:primary-500" />
  <slot />
</template>
