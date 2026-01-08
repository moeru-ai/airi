import type { SerializableDesktopCapturerSource } from '@proj-airi/electron-screen-capture'
import type { SourcesOptions } from 'electron'
import type { MaybeRefOrGetter } from 'vue'

import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'
import { computed, ref, toRaw, toValue } from 'vue'

interface ScreenCaptureSource extends SerializableDesktopCapturerSource {
  appIconURL?: string
  thumbnailURL?: string
}

function toLocalArrayBuffer(bytes: Uint8Array) {
  if (typeof SharedArrayBuffer !== 'undefined' && bytes.buffer instanceof SharedArrayBuffer) {
    return bytes.slice().buffer
  }
  return bytes.buffer as ArrayBuffer
}

function toObjectUrl(bytes: Uint8Array, mime: string) {
  return URL.createObjectURL(new Blob([toLocalArrayBuffer(bytes)], { type: mime }))
}

export function useVisionScreenCapture(sourcesOptions: MaybeRefOrGetter<SourcesOptions>) {
  const sources = ref<ScreenCaptureSource[]>([])
  const isRefetching = ref(false)
  const hasFetchedOnce = ref(false)
  const activeSourceId = ref('')
  const activeStream = ref<MediaStream | null>(null)

  const {
    getSources,
    setSource,
    resetSource,
  } = useElectronScreenCapture(window.electron.ipcRenderer, sourcesOptions)

  const activeSource = computed(() => sources.value.find(source => source.id === activeSourceId.value) || null)

  async function refetchSources() {
    try {
      isRefetching.value = true
      const nextSources = (await getSources())
        .sort((a, b) => {
          const aIsScreen = a.id.startsWith('screen:')
          const bIsScreen = b.id.startsWith('screen:')
          if (aIsScreen !== bIsScreen)
            return aIsScreen ? -1 : 1
          return a.name.localeCompare(b.name)
        })

      sources.value.forEach((oldSource) => {
        if (oldSource.appIconURL)
          URL.revokeObjectURL(oldSource.appIconURL)
        if (oldSource.thumbnailURL)
          URL.revokeObjectURL(oldSource.thumbnailURL)
      })

      sources.value = nextSources.map(source => ({
        ...source,
        appIconURL: source.appIcon && source.appIcon.length > 0 ? toObjectUrl(source.appIcon, 'image/png') : undefined,
        thumbnailURL: source.thumbnail && source.thumbnail.length > 0 ? toObjectUrl(source.thumbnail, 'image/jpeg') : undefined,
      }))

      if (!activeSourceId.value && sources.value.length > 0) {
        activeSourceId.value = sources.value[0]?.id || ''
      }
    }
    finally {
      isRefetching.value = false
      hasFetchedOnce.value = true
    }
  }

  async function startStream() {
    if (!activeSourceId.value)
      throw new Error('No active source selected')

    if (activeStream.value) {
      activeStream.value.getTracks().forEach(track => track.stop())
    }

    const handle = await setSource({
      options: toRaw(toValue(sourcesOptions)),
      sourceId: activeSourceId.value,
    })

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      activeStream.value = stream
      return stream
    }
    finally {
      await resetSource(handle)
    }
  }

  function stopStream() {
    if (activeStream.value) {
      activeStream.value.getTracks().forEach(track => track.stop())
    }
    activeStream.value = null
  }

  function cleanup() {
    stopStream()
    sources.value.forEach((oldSource) => {
      if (oldSource.appIconURL)
        URL.revokeObjectURL(oldSource.appIconURL)
      if (oldSource.thumbnailURL)
        URL.revokeObjectURL(oldSource.thumbnailURL)
    })
  }

  function captureFrame(video: HTMLVideoElement, quality = 0.82, maxWidth = 1280, maxHeight = 720) {
    if (!video || video.readyState < 2)
      return null

    const canvas = document.createElement('canvas')
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1)
    canvas.width = Math.round(sourceWidth * scale)
    canvas.height = Math.round(sourceHeight * scale)

    const ctx = canvas.getContext('2d')
    if (!ctx)
      throw new Error('Failed to create canvas context')

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', quality)
  }

  return {
    sources,
    activeSourceId,
    activeSource,
    activeStream,
    isRefetching,
    hasFetchedOnce,
    refetchSources,
    startStream,
    stopStream,
    cleanup,
    captureFrame,
  }
}
