<script setup lang="ts">
import { Application } from '@pixi/app'
import { extensions } from '@pixi/extensions'
import { Ticker, TickerPlugin } from '@pixi/ticker'
import { Live2DModel } from 'pixi-live2d-display/cubism4'
import { onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  width: number
  height: number
}>()

const containerRef = ref<HTMLDivElement>()
const pixiApp = ref<Application>()
const pixiAppCanvas = ref<HTMLCanvasElement>()

async function initLive2DPixiStage(parent: HTMLDivElement) {
  // https://guansss.github.io/pixi-live2d-display/#package-importing
  Live2DModel.registerTicker(Ticker)
  extensions.add(TickerPlugin)

  pixiApp.value = new Application({
    width: props.width,
    height: props.height,
    backgroundAlpha: 0,
  })

  pixiAppCanvas.value = pixiApp.value.view
  pixiAppCanvas.value.style.objectFit = 'contain'
  parent.appendChild(pixiApp.value.view)
}

function handleResize() {
  if (pixiApp.value)
    pixiApp.value.renderer.resize(props.width, props.height)

  if (pixiApp.value?.view) {
    pixiApp.value.view.width = props.width
    pixiApp.value.view.height = props.height
  }
}

watch([() => props.width, () => props.height], () => handleResize())

onMounted(async () => containerRef.value && await initLive2DPixiStage(containerRef.value))
onUnmounted(() => pixiApp.value?.destroy())
</script>

<template>
  <div ref="containerRef" h-full w-full>
    <slot :app="pixiApp" />
  </div>
</template>
