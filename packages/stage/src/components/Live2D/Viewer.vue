<script setup lang="ts">
import type { InternalModel } from 'pixi-live2d-display/cubism4'
import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { breakpointsTailwind, useBreakpoints } from '@vueuse/core'
import { Live2DModel, MotionPreloadStrategy, MotionPriority } from 'pixi-live2d-display/cubism4'
import { onMounted, onUnmounted, ref, watch } from 'vue'

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
const mouthOpenSize = computed(() => {
  return Math.max(0, Math.min(100, props.mouthOpenSize))
})

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = computed(() => breakpoints.between('sm', 'md').value || breakpoints.smaller('sm').value)
const { height, width } = useElementBounding(containerRef, { immediate: true, windowResize: true, reset: true })

function getCoreModel() {
  return model.value!.internalModel.coreModel as any
}

function setScale(model: Ref<Live2DModel<InternalModel> | undefined>) {
  if (!model.value)
    return

  let offsetFactor = 2
  if (isMobile.value) {
    offsetFactor = 2.5
  }

  const heightScale = height.value * 0.95 / model.value.height * offsetFactor
  const widthScale = width.value * 0.95 / model.value.width * offsetFactor
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

  const coreModel = model.value.internalModel.coreModel as any
  coreModel.setParameterValueById('ParamMouthOpenY', mouthOpenSize.value)
}

async function setMotion(motionName: string) {
  await model.value!.motion(motionName, undefined, MotionPriority.FORCE)
}

watch([width, height, width, height], () => {
  if (pixiApp.value)
    pixiApp.value.renderer.resize(width.value, height.value)

  if (pixiAppCanvas.value) {
    pixiAppCanvas.value.width = width.value
    pixiAppCanvas.value.height = height.value
  }

  if (model.value) {
    model.value.x = width.value / 2
    model.value.y = height.value
  }
})

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
