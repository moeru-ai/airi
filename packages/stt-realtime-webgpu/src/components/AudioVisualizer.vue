<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  stream?: MediaStream
}>()

const drawing = ref(false)
const canvasRef = ref<HTMLCanvasElement>()

onMounted(() => {
  handleDraw()
})

watch(() => props.stream, () => {
  handleDraw()
})

function handleDraw() {
  if (drawing.value)
    return
  if (!canvasRef.value)
    return
  if (!props.stream)
    return

  drawing.value = true

  const audioContext = new (window.AudioContext || (window as unknown as any).webkitAudioContext)()
  const source = audioContext.createMediaStreamSource(props.stream)
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 2048
  source.connect(analyser)

  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)

  const drawVisual = () => {
    try {
      if (!canvasRef.value)
        return

      requestAnimationFrame(drawVisual)
      analyser.getByteTimeDomainData(dataArray)

      const canvasCtx = canvasRef.value.getContext('2d')
      if (!canvasCtx)
        return

      canvasCtx.fillStyle = 'rgb(255, 255, 255)'
      canvasCtx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height)

      canvasCtx.lineWidth = 2
      canvasCtx.strokeStyle = 'rgb(0, 0, 0)'
      canvasCtx.beginPath()

      const sliceWidth = canvasRef.value.width * 1.0 / bufferLength

      let x = 0
      for (let i = 0; i < bufferLength; ++i) {
        const v = dataArray[i] / 128.0
        const y = v * canvasRef.value.height / 2

        if (i === 0) {
          canvasCtx.moveTo(x, y)
        }
        else {
          canvasCtx.lineTo(x, y)
        }

        x += sliceWidth
      }

      canvasCtx.lineTo(canvasRef.value.width, canvasRef.value.height / 2)
      canvasCtx.stroke()
    }
    catch (err) {
      console.error(err)
    }
  }

  drawVisual()
}
</script>

<template>
  <canvas ref="canvasRef" width="720" height="240" />
</template>
