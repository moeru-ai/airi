<script setup lang="ts">
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useDark, useElementBounding } from '@vueuse/core'
import { onMounted, ref } from 'vue'

const containerRef = ref<HTMLDivElement>()
// https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode
const analyser = ref<AnalyserNode>()
const analyserDataBuffer = ref<Uint8Array<ArrayBuffer>>()
const { audioContext } = useAudioContext()
const canvasElemRef = ref<HTMLCanvasElement>()
const isDark = useDark()

// https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate
// explain: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API
// reference: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Simple_synth
function fetchAnalyserDataDuringFrames() {
  if (!analyser.value || !analyserDataBuffer.value || !canvasElemRef.value)
    return

  // https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
  requestAnimationFrame(fetchAnalyserDataDuringFrames)
  if (analyserDataBuffer.value.length > 60 * 2)
    analyserDataBuffer.value = new Uint8Array(analyser.value.frequencyBinCount)

  analyser.value.getByteTimeDomainData(analyserDataBuffer.value)

  const context = canvasElemRef.value.getContext('2d')!

  if (isDark.value)
    context.fillStyle = 'rgba(34, 34, 34, 1)'
  else
    context.fillStyle = 'rgba(255, 255, 255, 1)'

  context.fillRect(0, 0, canvasElemRef.value.width, canvasElemRef.value.height)

  context.lineWidth = 2
  if (isDark.value)
    context.strokeStyle = 'rgb(255 255 255)'
  else
    context.strokeStyle = 'rgb(0 0 0)'

  context.beginPath()

  const sliceWidth = (canvasElemRef.value.width * 1.0) / analyser.value.frequencyBinCount
  let x = 0

  for (let i = 0; i < analyser.value.frequencyBinCount; i++) {
    const v = analyserDataBuffer.value[i] / 128.0
    const y = (v * canvasElemRef.value.height) / 2

    if (i === 0)
      context.moveTo(x, y)
    else
      context.lineTo(x, y)

    x += sliceWidth
  }

  context.lineTo(canvasElemRef.value.width, canvasElemRef.value.height / 2)
  context.stroke()
}

function initAnalyser() {
  analyser.value = audioContext.createAnalyser()
  analyserDataBuffer.value = new Uint8Array(analyser.value.frequencyBinCount)
  analyser.value.getByteTimeDomainData(analyserDataBuffer.value)
  const windowAny = window as any
  windowAny.analyserDataBuffer = analyserDataBuffer

  fetchAnalyserDataDuringFrames()
}

defineExpose({
  analyser: () => analyser.value,
})

onMounted(async () => {
  if (!containerRef.value || !canvasElemRef.value)
    return

  const containerElementBounding = useElementBounding(containerRef.value)
  containerElementBounding.update()

  initAnalyser()

  canvasElemRef.value.width = containerElementBounding.width.value
  canvasElemRef.value.height = containerElementBounding.height.value
})
</script>

<template>
  <div ref="containerRef" h="[80px]" w-full>
    <canvas ref="canvasElemRef" h-full w-full />
  </div>
</template>
