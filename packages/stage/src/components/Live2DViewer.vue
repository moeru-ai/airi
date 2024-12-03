<script setup lang="ts">
import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { breakpointsTailwind, useBreakpoints, useElementBounding, useWindowSize } from '@vueuse/core'
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
const { width, height } = useWindowSize()
const containerElementBounding = useElementBounding(containerRef)
const containerParentElementBounding = useElementBounding(containerRef.value?.parentElement)

const isMobile = computed(() => breakpoints.between('sm', 'md').value || breakpoints.smaller('sm').value)
const isTablet = computed(() => breakpoints.between('md', 'lg').value)
const isDesktop = computed(() => breakpoints.greaterOrEqual('lg').value)

const canvasWidth = computed(() => {
  if (isDesktop.value)
    return containerElementBounding.width.value
  else if (isMobile.value)
    return (width.value - 16) // padding
  else if (isTablet.value)
    return (width.value - 16) // padding
  else
    return containerElementBounding.width.value
})

const canvasHeight = computed(() => {
  if (isDesktop.value)
    return Math.max(600, containerParentElementBounding.height.value)
  else if (isMobile.value)
    return 600
  else if (isTablet.value)
    return 600
  else
    return Math.max(600, containerParentElementBounding.height.value)
})

function getCoreModel() {
  return model.value!.internalModel.coreModel as any
}

async function initLive2DPixiStage(parent: HTMLDivElement) {
  containerElementBounding.update()
  containerParentElementBounding.update()

  // https://guansss.github.io/pixi-live2d-display/#package-importing
  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)

  pixiApp.value = new Application({
    width: canvasWidth.value,
    height: canvasHeight.value,
    backgroundAlpha: 0,
  })

  pixiAppCanvas.value = pixiApp.value.view
  pixiAppCanvas.value.style.objectFit = 'contain'
  parent.appendChild(pixiApp.value.view)

  model.value = await Live2DModel.from(props.model, { motionPreload: MotionPreloadStrategy.ALL })
  pixiApp.value.stage.addChild(model.value as any)

  model.value.x = canvasWidth.value / 2
  model.value.y = canvasHeight.value
  model.value.rotation = Math.PI
  model.value.skew.x = Math.PI
  model.value.scale.set(0.3, 0.3)
  model.value.anchor.set(0.5, 0.5)

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

watch([width, height, canvasWidth, canvasHeight], () => {
  if (pixiApp.value)
    pixiApp.value.renderer.resize(canvasWidth.value, canvasHeight.value)

  if (pixiAppCanvas.value) {
    pixiAppCanvas.value.width = canvasWidth.value
    pixiAppCanvas.value.height = canvasHeight.value
  }

  if (model.value) {
    model.value.x = canvasWidth.value / 2
    model.value.y = canvasHeight.value
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
  <div ref="containerRef" />
</template>
