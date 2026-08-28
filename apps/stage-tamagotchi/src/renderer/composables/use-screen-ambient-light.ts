import type { SourcesOptions } from 'electron'

import type {
  ScreenAmbientLightCaptureStatus,
  ScreenAmbientLightDiagnosticsChannelEvent,
  ScreenAmbientLightDiagnosticsSnapshot,
} from '../../shared/screen-ambient-light-diagnostics'

import { errorMessageFrom } from '@moeru/std'
import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'
import { useElectronAllDisplays, useElectronWindowBounds } from '@proj-airi/electron-vueuse'
import { useLive2DAmbientLight, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { until, useBroadcastChannel, useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

import { screenAmbientLightDiagnosticsChannelName } from '../../shared/screen-ambient-light-diagnostics'
import { findDominantDisplayArea } from '../../shared/utils/electron/display'
import {
  ambientLightSampleFromHex,
  calculateWindowLightDirection,
  sampleScreenAmbientLight,
  smoothAmbientLight,
  smoothAmbientLightLobes,
} from '../utils/screen-ambient-light'

const sourcesOptions: SourcesOptions = {
  types: ['screen'],
  thumbnailSize: { width: 0, height: 0 },
}

/** Captures and samples the display behind the Desktop window for Live2D lighting. */
export function useScreenAmbientLight() {
  const settings = useSettingsLive2d()
  const {
    live2dScreenAmbientLightBlackCutoff,
    live2dScreenAmbientLightCaptureIntervalMs,
    live2dScreenAmbientLightEnabled,
    live2dScreenAmbientLightForcedColor,
    live2dScreenAmbientLightNeutralColorWeight,
    live2dScreenAmbientLightResponseMs,
    live2dScreenAmbientLightSampleHeight,
    live2dScreenAmbientLightSampleWidth,
    live2dScreenAmbientLightSource,
    live2dScreenAmbientLightWhiteCutoff,
  } = storeToRefs(settings)
  const ambientLight = useLive2DAmbientLight()
  const displays = useElectronAllDisplays()
  const windowBounds = useElectronWindowBounds()
  const capturedDisplay = shallowRef<(typeof displays.value)[number]>()
  const activeStream = shallowRef<MediaStream>()
  const video = document.createElement('video')
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const {
    data: diagnosticsChannelEvent,
    post: postDiagnosticsChannelEvent,
  } = useBroadcastChannel<ScreenAmbientLightDiagnosticsChannelEvent, ScreenAmbientLightDiagnosticsChannelEvent>({
    name: screenAmbientLightDiagnosticsChannelName,
  })
  let startVersion = 0
  let lastSampleTime = 0
  let lastCaptureError: string | undefined
  let lastDiagnostics: ScreenAmbientLightDiagnosticsSnapshot | undefined

  video.muted = true
  video.playsInline = true

  const hasWindowBounds = computed(() => windowBounds.width.value > 0 && windowBounds.height.value > 0)
  const samplingOptions = computed(() => ({
    blackCutoff: live2dScreenAmbientLightBlackCutoff.value,
    whiteCutoff: live2dScreenAmbientLightWhiteCutoff.value,
    neutralColorWeight: live2dScreenAmbientLightNeutralColorWeight.value,
  }))
  const lightDirection = computed(() => {
    const bounds = currentWindowBounds()
    const display = findDominantDisplayArea(bounds, displays.value)
    return display
      ? calculateWindowLightDirection(display.bounds, bounds)
      : { x: 0, y: 0 }
  })
  const {
    selectWithSource,
    checkMacOSPermission,
    requestMacOSPermission,
  } = useElectronScreenCapture(window.electron.ipcRenderer, sourcesOptions)

  const { pause: pauseSampling, resume: resumeSampling } = useIntervalFn(sample, live2dScreenAmbientLightCaptureIntervalMs, {
    immediate: false,
    immediateCallback: true,
  })

  watch([live2dScreenAmbientLightEnabled, live2dScreenAmbientLightSource], async ([enabled, source]) => {
    const version = ++startVersion
    stop()
    if (!enabled) {
      publishDiagnostics(lastCaptureError ? 'error' : 'disabled')
      return
    }

    lastCaptureError = undefined

    if (source === 'forced-color') {
      applyForcedColor()
      return
    }

    publishDiagnostics('starting')
    try {
      await start(version)
    }
    catch (error) {
      if (version !== startVersion)
        return

      lastCaptureError = errorMessageFrom(error) ?? 'Unknown error'
      console.error(`Failed to start Live2D screen ambient light: ${lastCaptureError}`)
      publishDiagnostics('error')
      live2dScreenAmbientLightEnabled.value = false
    }
  }, { immediate: true })

  watch(diagnosticsChannelEvent, (event) => {
    if (event?.type !== 'request-current')
      return

    if (lastDiagnostics)
      postDiagnosticsChannelEvent({ type: 'snapshot', snapshot: lastDiagnostics })
    else
      publishDiagnostics('disabled')
  })

  watch([live2dScreenAmbientLightForcedColor, lightDirection], () => {
    if (live2dScreenAmbientLightEnabled.value && live2dScreenAmbientLightSource.value === 'forced-color')
      applyForcedColor()
  })

  watch([live2dScreenAmbientLightSampleWidth, live2dScreenAmbientLightSampleHeight], ([width, height]) => {
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
  }, { immediate: true })

  onScopeDispose(() => {
    startVersion += 1
    stop()
  })

  async function start(version: number) {
    if (!context)
      throw new Error('Failed to create the screen sampling canvas')

    const permission = await checkMacOSPermission()
    if (permission === 'not-determined')
      await requestMacOSPermission()

    if (displays.value.length === 0)
      await until(displays).toMatch(currentDisplays => currentDisplays.length > 0)
    if (!hasWindowBounds.value)
      await until(hasWindowBounds).toBe(true)
    if (version !== startVersion)
      return

    const bounds = currentWindowBounds()
    const display = findDominantDisplayArea(bounds, displays.value)
    if (!display)
      throw new Error('No display is available for screen ambient light')

    const stream = await selectWithSource(
      sources => sources.find(source => source.display_id === String(display.id))?.id
        ?? sources.find(source => source.id.startsWith('screen:'))?.id
        ?? '',
      async () => await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }),
    )

    if (version !== startVersion) {
      stream.getTracks().forEach(track => track.stop())
      return
    }

    capturedDisplay.value = display
    activeStream.value = stream
    stream.getVideoTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (activeStream.value === stream) {
          lastCaptureError = 'The screen-capture stream ended.'
          live2dScreenAmbientLightEnabled.value = false
        }
      }, { once: true })
    })

    video.srcObject = stream
    await waitForVideo(video)
    if (version !== startVersion)
      return

    lastSampleTime = performance.now()
    resumeSampling()
  }

  function stop() {
    pauseSampling()
    const stream = activeStream.value
    activeStream.value = undefined
    capturedDisplay.value = undefined
    video.pause()
    video.srcObject = null
    stream?.getTracks().forEach(track => track.stop())
    ambientLight.reset()
  }

  function sample() {
    if (!context || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
      return

    const display = capturedDisplay.value
    if (!display)
      return

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const frame = context.getImageData(0, 0, canvas.width, canvas.height)
    const excludedWindow = normalizeWindowBounds(display.bounds, currentWindowBounds())
    const result = sampleScreenAmbientLight(frame, {
      exclude: excludedWindow,
    }, samplingOptions.value)
    const target = result.sample
    let nextSample = ambientLight.active ? { ...ambientLight.sample } : undefined
    let nextLobes = ambientLight.active ? [...ambientLight.lobes] : []
    if (target) {
      const now = performance.now()
      const elapsedMs = now - lastSampleTime
      nextSample = ambientLight.active
        ? smoothAmbientLight(ambientLight.sample, target, elapsedMs, live2dScreenAmbientLightResponseMs.value)
        : target
      nextLobes = ambientLight.active
        ? smoothAmbientLightLobes(ambientLight.lobes, result.lobes, elapsedMs, live2dScreenAmbientLightResponseMs.value)
        : result.lobes
      lastSampleTime = now
      ambientLight.setSample(
        nextSample,
        calculateWindowLightDirection(display.bounds, currentWindowBounds()),
        nextLobes,
      )
    }

    publishDiagnostics('capturing', {
      frame: {
        width: frame.width,
        height: frame.height,
        data: frame.data.slice(),
      },
      excludedRegion: excludedWindow,
      sampling: {
        ...result.diagnostics,
        targetSample: target,
        appliedSample: nextSample,
        targetLobes: result.lobes,
        appliedLobes: nextLobes,
      },
    })
  }

  function applyForcedColor() {
    const sample = ambientLightSampleFromHex(live2dScreenAmbientLightForcedColor.value)
    if (!sample) {
      lastCaptureError = 'The forced color must use #RRGGBB or #RRGGBBAA format.'
      console.error(`Failed to apply forced Live2D ambient light: ${lastCaptureError}`)
      ambientLight.reset()
      publishDiagnostics('error')
      return
    }

    lastCaptureError = undefined
    ambientLight.setSample(sample, lightDirection.value)
    publishDiagnostics('forced-color', {
      sampling: {
        totalPixelCount: 0,
        excludedPixelCount: 0,
        transparentPixelCount: 0,
        blackPixelCount: 0,
        whitePixelCount: 0,
        acceptedPixelCount: 0,
        weightTotal: 0,
        averageSaturation: 0,
        targetSample: sample,
        appliedSample: sample,
        targetLobes: [],
        appliedLobes: [],
      },
    })
  }

  function currentWindowBounds() {
    return {
      x: windowBounds.x.value,
      y: windowBounds.y.value,
      width: windowBounds.width.value,
      height: windowBounds.height.value,
    }
  }

  function publishDiagnostics(
    status: ScreenAmbientLightCaptureStatus,
    details: Partial<Pick<ScreenAmbientLightDiagnosticsSnapshot, 'frame' | 'excludedRegion' | 'sampling'>> = {},
  ) {
    const display = capturedDisplay.value
    const snapshot: ScreenAmbientLightDiagnosticsSnapshot = {
      publishedAt: Date.now(),
      status,
      source: live2dScreenAmbientLightSource.value,
      error: lastCaptureError,
      display: display
        ? {
            id: display.id,
            bounds: { ...display.bounds },
          }
        : undefined,
      windowBounds: currentWindowBounds(),
      videoSize: video.videoWidth > 0 && video.videoHeight > 0
        ? { width: video.videoWidth, height: video.videoHeight }
        : undefined,
      direction: display
        ? calculateWindowLightDirection(display.bounds, currentWindowBounds())
        : lightDirection.value,
      ...details,
    }
    lastDiagnostics = snapshot
    postDiagnosticsChannelEvent({ type: 'snapshot', snapshot })
  }
}

function normalizeWindowBounds(
  display: { x: number, y: number, width: number, height: number },
  window: { x: number, y: number, width: number, height: number },
) {
  return {
    x: (window.x - display.x) / display.width,
    y: (window.y - display.y) / display.height,
    width: window.width / display.width,
    height: window.height / display.height,
  }
}

async function waitForVideo(video: HTMLVideoElement) {
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true })
      video.addEventListener('error', () => reject(video.error ?? new Error('Screen capture video failed to load')), { once: true })
    })
  }

  await video.play()
}
