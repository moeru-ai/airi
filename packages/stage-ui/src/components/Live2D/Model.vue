<script setup lang="ts">
import type { Application } from '@pixi/app'
import type { InternalModel } from 'pixi-live2d-display/cubism4'
import type { Ref } from 'vue'

import { extensions } from '@pixi/extensions'
import { InteractionManager } from '@pixi/interaction'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { breakpointsTailwind, useBreakpoints, useDark, useDebounceFn, watchDebounced } from '@vueuse/core'
import JSZip from 'jszip'
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

const { live2dModel, loadingLive2dModel, live2dCurrentMotion, availableLive2dMotions, live2dMotionMap } = storeToRefs(useSettings())
const currentMotion = ref<{ group: string, index: number }>({ group: 'Idle', index: 0 })

async function loadModel(source: string | File, patchMotionMap = false) {
  if (!pixiApp.value)
    return

  if (model.value) {
    pixiApp.value.stage.removeChild(model.value)
    model.value.destroy()
    model.value = undefined
  }

  // patch the motion map to model3.json
  if (source instanceof Blob && patchMotionMap) {
    const jsZip = new JSZip()
    const zip = await jsZip.loadAsync(source)
    const fileName = Object.keys(zip.files).find(key => key.endsWith('model3.json'))
    if (!fileName) {
      throw new Error('model3.json not found')
    }

    const model3Json = await zip.file(fileName)!.async('string')
    const model3JsonObject = JSON.parse(model3Json)

    const motionMap = Object.entries(live2dMotionMap.value).reduce((acc, [key, value]) => { // only convert when patch, otherwise should use map { fileName, emotion, originalMotionName, motionIndex }
      acc[key] = value.map(motion => ({ File: motion }))
      return acc
    }, {} as Record<string, { File: string }[]>)
    model3JsonObject.FileReferences.Motions = motionMap

    zip.file(fileName, JSON.stringify(model3JsonObject, null, 2))
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    source = new File([zipBlob], source.name, {
      type: source.type,
      lastModified: source.lastModified,
    })
  }

  // load the model

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
  const live2dModelBlob = await localforage.getItem<File>('live2dModel')
  if (live2dModelBlob) {
    await loadModel(live2dModelBlob, true)
    return
  }

  await loadModel(live2dModel.value)
}

async function setMotion(motionName: string, index: number) {
  await model.value!.motion(motionName, index, MotionPriority.FORCE)
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
watch(live2dCurrentMotion, value => setMotion(value.group, value.index))
watch(paused, (value) => {
  value ? pixiApp.value?.stop() : pixiApp.value?.start()
})
// watch(live2dMotionMap, (value) => {
// need to patch the model3.json, then reload the model
// })

watchDebounced(live2dModel, (value) => {
  if (!value)
    return

  loadModel(value, true)
}, { debounce: 1000 })

onMounted(updateDropShadowFilter)
onUnmounted(() => {
  model.value && pixiApp.value?.stage.removeChild(model.value)
})
</script>

<template>
  <slot />
</template>
