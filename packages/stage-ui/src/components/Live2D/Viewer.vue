<script setup lang="ts">
import type { InternalModel } from 'pixi-live2d-display/cubism4'
import type { Ref } from 'vue'

import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { breakpointsTailwind, useBreakpoints, useDark, useDebounceFn, useElementBounding } from '@vueuse/core'
import { DropShadowFilter } from 'pixi-filters'
import { Live2DModel, MotionPreloadStrategy, MotionPriority } from 'pixi-live2d-display/cubism4'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useLive2DIdleEyeFocus } from '../../composables/live2d'

const props = withDefaults(defineProps<{
  model: string
  mouthOpenSize?: number
}>(), {
  mouthOpenSize: 0,
})

const containerRef = ref<HTMLDivElement>()
const pixiApp = ref<Application>()
const pixiAppCanvas = ref<HTMLCanvasElement>()
const model = ref<Live2DModel>()
const initialModelWidth = ref<number>(0)
const initialModelHeight = ref<number>(0)
const mouthOpenSize = computed(() => {
  return Math.max(0, Math.min(100, props.mouthOpenSize))
})

const dark = useDark()
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = computed(() => breakpoints.between('sm', 'md').value || breakpoints.smaller('sm').value)
const { height, width } = useElementBounding(containerRef, { immediate: true, windowResize: true, reset: true })

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

  const heightScale = height.value * 0.95 / initialModelHeight.value * offsetFactor
  const widthScale = width.value * 0.95 / initialModelWidth.value * offsetFactor
  const scale = Math.min(heightScale, widthScale)

  model.value.scale.set(scale, scale)
}

async function initLive2DPixiStage(parent: HTMLDivElement) {
  // https://guansss.github.io/pixi-live2d-display/#package-importing
  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)

  pixiApp.value = new Application({
    width: width.value,
    height: height.value,
    backgroundAlpha: 0,
  })

  pixiAppCanvas.value = pixiApp.value.view
  pixiAppCanvas.value.style.objectFit = 'contain'
  parent.appendChild(pixiApp.value.view)

  model.value = await Live2DModel.from(props.model, { motionPreload: MotionPreloadStrategy.ALL })
  pixiApp.value.stage.addChild(model.value as any)
  initialModelWidth.value = model.value.width
  initialModelHeight.value = model.value.height

  model.value.x = width.value / 2
  model.value.y = height.value
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
}

async function setMotion(motionName: string) {
  await model.value!.motion(motionName, undefined, MotionPriority.FORCE)
}

const handleResize = useDebounceFn(() => {
  if (pixiApp.value)
    pixiApp.value.renderer.resize(width.value, height.value)

  if (pixiAppCanvas.value) {
    pixiAppCanvas.value.width = width.value
    pixiAppCanvas.value.height = height.value
  }

  if (model.value) {
    model.value.x = width.value / 2
    model.value.y = height.value
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

watch([width, height], () => {
  handleResize()
})

watch(dark, updateDropShadowFilter, {
  immediate: true,
})

watch(model, updateDropShadowFilter)

onMounted(updateDropShadowFilter)

onMounted(async () => {
  if (!containerRef.value)
    return

  await initLive2DPixiStage(containerRef.value)
})

onUnmounted(() => {
  pixiApp.value?.destroy()
})

watch(mouthOpenSize, (value) => {
  getCoreModel().setParameterValueById('ParamMouthOpenY', value)
})

defineExpose({
  setMotion,
})
</script>

<template>
  <div ref="containerRef" h-full w-full />
</template>
