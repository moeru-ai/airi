<script setup lang="ts" generic="T extends any, O extends any">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import { useElementBounding } from '@vueuse/core'

const props = withDefaults(defineProps<{
  mouthOpenSize?: number
}>(), {
  mouthOpenSize: 0,
})

const containerRef = ref<HTMLDivElement>()
const pixiApp = ref<Application>()
const model = ref<Live2DModel>()
const mouthOpenSize = computed(() => {
  return Math.max(0, Math.min(100, props.mouthOpenSize))
})

async function initLive2DPixiStage(parent: HTMLDivElement) {
  const containerElementBounding = useElementBounding(parent)
  containerElementBounding.update()

  // https://guansss.github.io/pixi-live2d-display/#package-importing
  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)

  pixiApp.value = new Application({
    width: containerElementBounding.width.value,
    height: 550,
    backgroundAlpha: 0,
  })

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
