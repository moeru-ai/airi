import type { SourcesOptions } from 'electron'

import { errorMessageFrom } from '@moeru/std'
import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'
import { useElectronAllDisplays, useElectronWindowBounds } from '@proj-airi/electron-vueuse'
import { useLive2DAmbientLight, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { until, useIntervalFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

import { findDominantDisplayArea } from '../../shared/utils/electron/display'
import {
  ambientLightSampleFromHex,
  calculateWindowLightDirection,
  sampleScreenAmbientLight,
  smoothAmbientLight,
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
  let startVersion = 0
  let lastSampleTime = 0

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
    if (!enabled)
      return

    if (source === 'forced-color') {
      applyForcedColor()
      return
    }

    try {
      await start(version)
    }
    catch (error) {
      if (version !== startVersion)
        return

      console.error(`Failed to start Live2D screen ambient light: ${errorMessageFrom(error) ?? 'Unknown error'}`)
      live2dScreenAmbientLightEnabled.value = false
    }
  }, { immediate: true })

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
        if (activeStream.value === stream)
          live2dScreenAmbientLightEnabled.value = false
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
    const target = sampleScreenAmbientLight(frame, {
      exclude: excludedWindow,
    }, samplingOptions.value)
    if (!target)
      return

    const now = performance.now()
    const nextSample = ambientLight.active
      ? smoothAmbientLight(ambientLight.sample, target, now - lastSampleTime, live2dScreenAmbientLightResponseMs.value)
      : target
    lastSampleTime = now
    ambientLight.setSample(nextSample, calculateWindowLightDirection(display.bounds, currentWindowBounds()))
  }

  function applyForcedColor() {
    const sample = ambientLightSampleFromHex(live2dScreenAmbientLightForcedColor.value)
    if (!sample) {
      console.error('Failed to apply forced Live2D ambient light: the color must use #RRGGBB or #RRGGBBAA format')
      ambientLight.reset()
      return
    }

    ambientLight.setSample(sample, lightDirection.value)
  }

  function currentWindowBounds() {
    return {
      x: windowBounds.x.value,
      y: windowBounds.y.value,
      width: windowBounds.width.value,
      height: windowBounds.height.value,
    }
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
