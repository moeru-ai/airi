<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { InternalModel } from 'pixi-live2d-display/cubism4'
import type { Ref } from 'vue'

import { extensions } from '@pixi/extensions'
import { InteractionManager } from '@pixi/interaction'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { breakpointsTailwind, useBreakpoints, useDark, useDebounceFn, watchDebounced } from '@vueuse/core'
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
  motion?: string
  paused: boolean
}>(), {
  mouthOpenSize: 0,
  motion: '',
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

const { live2dModel, loadingLive2dModel } = storeToRefs(useSettings())

// FIXME: it cannot blink if loading other model
async function loadModel(source: string | Blob) {
  if (!pixiApp.value)
    return

  if (model.value) {
    pixiApp.value.stage.removeChild(model.value)
    model.value.destroy()
    model.value = undefined
  }

  loadingLive2dModel.value = true

  const modelInstance = new Live2DModel()

  if (source instanceof Blob) {
    await Live2DFactory.setupLive2DModel(modelInstance, [source])
  }
  else {
    await Live2DFactory.setupLive2DModel(modelInstance, source)
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

  // Remove eye ball movements from idle motion group to prevent conflicts
  // This is too hacky
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

  // save to indexdb
  await localforage.setItem('live2dModel', source)

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
  const live2dModelBlob = await localforage.getItem<Blob>('live2dModel')
  if (live2dModelBlob) {
    await loadModel(live2dModelBlob)
    return
  }

  await loadModel(live2dModel.value)
}

async function setMotion(motionName: string) {
  await model.value!.motion(motionName, undefined, MotionPriority.FORCE)
}

const handleResize = useDebounceFn(() => {
  if (model.value) {
    model.value.x = props.width / 2
    model.value.y = props.height
    setScale(model)
  }
}, 100)

function updateDropShadowFilter() {
  if (model.value) {
    model.value.filters = [new DropShadowFilter({
      color: dark.value ? 0x99667F : 0xDFB9D2,
      alpha: 0.3,
      blur: 0,
      distance: 20,
      rotation: 45,
    })]
  }
}

watch([() => props.width, () => props.height], () => handleResize())
watch(dark, updateDropShadowFilter, { immediate: true })
watch(model, updateDropShadowFilter)
watch(mouthOpenSize, value => getCoreModel().setParameterValueById('ParamMouthOpenY', value))
watch(pixiApp, initLive2DPixiStage)
watch(() => props.motion, () => props.motion && setMotion(props.motion))
watch(paused, (value) => {
  value ? pixiApp.value?.stop() : pixiApp.value?.start()
})

watchDebounced(live2dModel, (value) => {
  if (!value)
    return

  loadModel(value)
}, { debounce: 1000 })

onMounted(updateDropShadowFilter)
onUnmounted(() => {
  model.value && pixiApp.value?.stage.removeChild(model.value)
})
</script>

<template>
  <slot />
</template>
