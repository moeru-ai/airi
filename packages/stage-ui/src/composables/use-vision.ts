import type { ChatProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref } from 'vue'

export function useVision() {
  const visionStore = useVisionStore()
  const {
    configured,
    activeVisionProvider,
    activeVisionModel,
    enableCameraCapture,
    enableScreenCapture,
    autoAnalyzeOnCapture,
  } = storeToRefs(visionStore)

  const isReady = computed(() => configured.value
    && ((enableCameraCapture.value || enableScreenCapture.value)))

  async function analyzeImage(imageData: string | Blob | ArrayBuffer, prompt?: string, options?: ChatProviderWithExtraOptions<string, any>) {
    if (!configured.value) {
      throw new Error('Vision provider not configured')
    }

    return visionStore.analyzeImageDirect(imageData, prompt, options)
  }

  async function enableCapture(type: 'camera' | 'screen') {
    if (type === 'camera') {
      enableCameraCapture.value = true
    }
    else {
      enableScreenCapture.value = true
    }
  }

  async function disableCapture(type: 'camera' | 'screen') {
    if (type === 'camera') {
      enableCameraCapture.value = false
    }
    else {
      enableScreenCapture.value = false
    }
  }

  function getProviderInfo() {
    if (!configured.value) {
      return null
    }

    return {
      providerId: activeVisionProvider.value,
      model: activeVisionModel.value,
      capabilities: {
        camera: enableCameraCapture.value,
        screen: enableScreenCapture.value,
        autoAnalyze: autoAnalyzeOnCapture.value,
      },
    }
  }

  return {
    // State
    isReady,
    configured,
    activeVisionProvider: computed(() => activeVisionProvider.value),
    activeVisionModel: computed(() => activeVisionModel.value),
    enableCameraCapture: computed(() => enableCameraCapture.value),
    enableScreenCapture: computed(() => enableScreenCapture.value),
    autoAnalyzeOnCapture: computed(() => autoAnalyzeOnCapture.value),

    // Methods
    analyzeImage,
    enableCapture,
    disableCapture,
    getProviderInfo,
  }
}

/**
 * Camera capture composable
 */
export function useCameraCapture() {
  const stream = ref<MediaStream | null>(null)
  const isCapturing = ref(false)
  const error = ref<string>('')

  async function startCapture(constraints?: MediaStreamConstraints) {
    try {
      error.value = ''
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: constraints?.video || {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      stream.value = mediaStream
      isCapturing.value = true
      return mediaStream
    }
    catch (err) {
      error.value = `Camera access failed: ${err.message}`
      throw err
    }
  }

  function stopCapture() {
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop())
      stream.value = null
    }
    isCapturing.value = false
  }

  function captureFrame(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement): string | null {
    if (!videoElement || !canvasElement || !isCapturing.value) {
      return null
    }

    const context = canvasElement.getContext('2d')
    if (!context)
      return null

    canvasElement.width = videoElement.videoWidth
    canvasElement.height = videoElement.videoHeight
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height)

    return canvasElement.toDataURL('image/jpeg', 0.95)
  }

  onUnmounted(() => {
    stopCapture()
  })

  return {
    stream,
    isCapturing,
    error,
    startCapture,
    stopCapture,
    captureFrame,
  }
}

/**
 * Screen capture composable
 */
export function useScreenCapture() {
  const stream = ref<MediaStream | null>(null)
  const isCapturing = ref(false)
  const error = ref<string>('')

  async function startCapture(constraints?: DisplayMediaStreamConstraints) {
    try {
      error.value = ''
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: constraints?.video || {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      stream.value = mediaStream
      isCapturing.value = true

      // Listen for stream end
      mediaStream.getVideoTracks()[0].addEventListener('ended', () => {
        stopCapture()
      })

      return mediaStream
    }
    catch (err) {
      error.value = `Screen capture failed: ${err.message}`
      throw err
    }
  }

  function stopCapture() {
    if (stream.value) {
      stream.value.getTracks().forEach(track => track.stop())
      stream.value = null
    }
    isCapturing.value = false
  }

  function captureFrame(videoElement: HTMLVideoElement, canvasElement: HTMLCanvasElement): string | null {
    if (!videoElement || !canvasElement || !isCapturing.value) {
      return null
    }

    const context = canvasElement.getContext('2d')
    if (!context)
      return null

    canvasElement.width = videoElement.videoWidth
    canvasElement.height = videoElement.videoHeight
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height)

    return canvasElement.toDataURL('image/jpeg', 0.95)
  }

  onUnmounted(() => {
    stopCapture()
  })

  return {
    stream,
    isCapturing,
    error,
    startCapture,
    stopCapture,
    captureFrame,
  }
}
