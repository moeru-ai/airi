import type { SerializableDesktopCapturerSource } from '@proj-airi/electron-screen-capture'
import type { SourcesOptions } from 'electron'
import type { MaybeRefOrGetter } from 'vue'

import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'
import { computed, ref, shallowRef } from 'vue'

import { createObjectUrlFromBytes } from '../utils/create-object-url-from-bytes'

interface ScreenCaptureSource extends SerializableDesktopCapturerSource {
  appIconURL?: string
  thumbnailURL?: string
}

/**
 * Manages Electron-backed screen-capture sources and the active preview stream for vision workflows.
 *
 * Use when:
 * - A renderer page needs to browse screen/window sources before capturing frames
 * - The page should keep a single active `MediaStream` in sync with the selected source
 *
 * Expects:
 * - The Electron screen-capture preload APIs to be available on `window.electron.ipcRenderer`
 * - Callers to invoke `cleanup()` when the owning component unmounts
 *
 * Returns:
 * - Reactive source lists, active stream state, and helpers for refetching, starting, stopping, and capturing frames
 */
export function useVisionScreenCapture(sourcesOptions: MaybeRefOrGetter<SourcesOptions>) {
  const sources = ref<ScreenCaptureSource[]>([])
  const isRefetching = ref(false)
  const hasFetchedOnce = ref(false)
  const activeSourceId = ref('')
  const activeStream = shallowRef<MediaStream | null>(null)
  const activeStreamSourceId = ref('')

  const {
    getSources,
    selectWithSource,
  } = useElectronScreenCapture(window.electron.ipcRenderer, sourcesOptions)

  const activeSource = computed(() => sources.value.find(source => source.id === activeSourceId.value) || null)

  function isActiveStream(stream: MediaStream | null | undefined) {
    if (!stream)
      return false

    return stream.getVideoTracks().some(track => track.readyState === 'live')
  }

  function clearActiveStream() {
    const stream = activeStream.value
    if (!stream) {
      activeStream.value = null
      activeStreamSourceId.value = ''
      return
    }

    stream.getTracks().forEach(track => track.stop())
    activeStream.value = null
    activeStreamSourceId.value = ''
  }

  function revokeSourceObjectUrls(entries: ScreenCaptureSource[]) {
    entries.forEach((source) => {
      if (source.appIconURL)
        URL.revokeObjectURL(source.appIconURL)
      if (source.thumbnailURL)
        URL.revokeObjectURL(source.thumbnailURL)
    })
  }

  function syncActiveSource(nextSourceId: string) {
    if (activeStreamSourceId.value && activeStreamSourceId.value !== nextSourceId) {
      clearActiveStream()
    }

    activeSourceId.value = nextSourceId
  }

  function attachStreamLifecycle(stream: MediaStream, sourceId: string) {
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (activeStream.value === stream && activeStreamSourceId.value === sourceId) {
          activeStream.value = null
          activeStreamSourceId.value = ''
        }
      }, { once: true })
    })
  }

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

      revokeSourceObjectUrls(sources.value)

      sources.value = nextSources.map(source => ({
        ...source,
        appIconURL: source.appIcon && source.appIcon.length > 0 ? createObjectUrlFromBytes(source.appIcon, 'image/png') : undefined,
        thumbnailURL: source.thumbnail && source.thumbnail.length > 0 ? createObjectUrlFromBytes(source.thumbnail, 'image/jpeg') : undefined,
      }))

      const hasActiveSource = sources.value.some(source => source.id === activeSourceId.value)
      const nextActiveSourceId = hasActiveSource ? activeSourceId.value : sources.value[0]?.id || ''
      syncActiveSource(nextActiveSourceId)
    }
    finally {
      isRefetching.value = false
      hasFetchedOnce.value = true
    }
  }

  async function startStream() {
    const sourceId = activeSourceId.value
    if (!sourceId)
      throw new Error('No active source selected')

    if (isActiveStream(activeStream.value) && activeStreamSourceId.value === sourceId)
      return activeStream.value!

    clearActiveStream()

    const stream = await selectWithSource(
      () => sourceId,
      async () => await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }),
    )
    if (!isActiveStream(stream)) {
      stream.getTracks().forEach(track => track.stop())
      throw new Error('Selected source did not provide a live video track')
    }

    activeStream.value = stream
    activeStreamSourceId.value = sourceId
    attachStreamLifecycle(stream, sourceId)

    return stream
  }

  function stopStream() {
    clearActiveStream()
  }

  function cleanup() {
    stopStream()
    revokeSourceObjectUrls(sources.value)
  }

  function captureFrame(video: HTMLVideoElement, quality = 0.82, maxWidth = 1280, maxHeight = 720) {
    if (!video || video.readyState < 2)
      return null

    const canvas = document.createElement('canvas')
    const sourceWidth = video.videoWidth
    const sourceHeight = video.videoHeight
    if (sourceWidth <= 0 || sourceHeight <= 0)
      return null

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
