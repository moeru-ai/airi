<script setup lang="ts" generic="T extends any, O extends any">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import { useElementBounding, useWindowSize } from '@vueuse/core'

const props = withDefaults(defineProps<{
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

const { width, height } = useWindowSize()
const containerElementBounding = useElementBounding(containerRef)

async function initLive2DPixiStage(parent: HTMLDivElement) {
  containerElementBounding.update()

  // https://guansss.github.io/pixi-live2d-display/#package-importing
  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)

  pixiApp.value = new Application({
    width: containerElementBounding.width.value,
    height: 550,
    backgroundAlpha: 0,
  })

  pixiAppCanvas.value = pixiApp.value.view
  parent.appendChild(pixiApp.value.view)

  model.value = await Live2DModel.from('assets/live2d/models/hiyori_free_zh/runtime/hiyori_free_t08.model3.json')
  pixiApp.value.stage.addChild(model.value as any)

  model.value.x = containerElementBounding.width.value / 2
  model.value.y = 600
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

watch([width, height], () => {
  if (pixiApp.value)
    pixiApp.value.renderer.resize((width.value - 16) / 2, 550)

  if (pixiAppCanvas.value) {
    pixiAppCanvas.value.width = (width.value - 16) / 2
    pixiAppCanvas.value.height = 550
  }

  if (model.value) {
    model.value.x = (width.value - 16) / 4
    model.value.y = 600
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
  const coreModel = model.value!.internalModel.coreModel as any
  coreModel.setParameterValueById('ParamMouthOpenY', value)
})
</script>

<template>
  <div ref="containerRef" h="[550px]" w-full />
</template>
