import type { SourcesOptions } from 'electron'

import type {
  ScreenAmbientLightCaptureStatus,
  ScreenAmbientLightDiagnosticsChannelEvent,
  ScreenAmbientLightDiagnosticsSnapshot,
} from '../../shared/screen-ambient-light-diagnostics'

import { errorMessageFrom } from '@moeru/std'
import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'
import { useElectronAllDisplays, useElectronWindowBounds } from '@proj-airi/electron-vueuse'
import {
  ambientLightSampleFromHex,
  sampleScreenAmbientLight,
  smoothAmbientLightEnvironment,
  uniformAmbientLightEnvironment,
} from '@proj-airi/stage-shared/screen-ambient-light'
import { useLive2DAmbientLight, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { until, useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

import { screenAmbientLightDiagnosticsChannelName } from '../../shared/screen-ambient-light-diagnostics'
import { findDominantDisplayArea } from '../../shared/utils/electron/display'
import { useStagePaintedMask } from './use-stage-painted-mask'

const sourcesOptions: SourcesOptions = {
  types: ['screen'],
  thumbnailSize: { width: 0, height: 0 },
}

/**
 * Oversampling of the capture stream relative to the sample canvas.
 *
 * The stream is requested at this multiple of the sample width, so that the
 * canvas downscale averages a few source pixels per sample instead of picking
 * one. 4 keeps a 128-pixel sample at 512 pixels, which is small enough that the
 * per-frame readback costs well under a millisecond.
 */
const captureOversampling = 4
/**
 * Widest stream the capture asks for, in pixels.
 *
 * Above this width the oversampling drops below 4, which a large sample frame
 * does not need. The renderer pays for every stream pixel twice, once in the
 * decode and once in the draw into the sample canvas: at 1024 x 576 and 20
 * frames per second the draw alone took 4.4 ms per frame.
 */
const maximumCaptureWidth = 512

/**
 * Captures and samples the display behind the Desktop window for Live2D lighting.
 *
 * Capture state lives in this composable. The store receives only the smoothed
 * environment. The lifecycle is:
 *
 * - `enabled` or `source` changes stop the current capture and start the next.
 * - The capture stream is constrained to a small frame at the sample rate, so
 *   the renderer never receives full-resolution frames it does not use.
 * - Each delivered frame samples once through `requestVideoFrameCallback`, so
 *   the sample rate equals the stream rate and no timer samples a stale frame.
 * - A stream that ends outside this composable disables the feature and reports
 *   the reason through diagnostics.
 */
export function useScreenAmbientLight(sources: {
  /**
   * The canvas the character renders into. Its alpha says which pixels of the
   * window AIRI paints, which is what separates the character from the desktop
   * showing through behind it. Without it the backlight stays off.
   */
  stageCanvas?: () => HTMLCanvasElement | undefined
} = {}) {
  const settings = useSettingsLive2d()
  const {
    live2dScreenAmbientLightCaptureIntervalMs,
    live2dScreenAmbientLightEnabled,
    live2dScreenAmbientLightForcedColor,
    live2dScreenAmbientLightNeutralColorWeight,
    live2dScreenAmbientLightResponseMs,
    live2dScreenAmbientLightSampleHeight,
    live2dScreenAmbientLightSampleWidth,
    live2dScreenAmbientLightSource,
  } = storeToRefs(settings)
  const ambientLight = useLive2DAmbientLight()
  const displays = useElectronAllDisplays()
  const windowBounds = useElectronWindowBounds()
  const capturedDisplay = shallowRef<(typeof displays.value)[number]>()
  const activeStream = shallowRef<MediaStream>()
  const video = document.createElement('video')
  const canvas = document.createElement('canvas')
  // The canvas exists only to read pixels back. A software canvas makes
  // getImageData cheap, and the draw into it is a downscale of a frame that is
  // already small, so the software path costs nothing measurable.
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const paintedMask = useStagePaintedMask({
    stageCanvas: sources.stageCanvas,
    sampleGrid: () => ({ width: canvas.width, height: canvas.height }),
    windowSize: () => ({ width: windowBounds.width.value, height: windowBounds.height.value }),
  })
  const {
    data: diagnosticsChannelEvent,
    post: postDiagnosticsChannelEvent,
  } = useBroadcastChannel<ScreenAmbientLightDiagnosticsChannelEvent, ScreenAmbientLightDiagnosticsChannelEvent>({
    name: screenAmbientLightDiagnosticsChannelName,
  })
  let startVersion = 0
  let frameCallbackHandle = 0
  let lastSampleTime = 0
  let lastCaptureError: string | undefined
  let lastDiagnostics: ScreenAmbientLightDiagnosticsSnapshot | undefined

  video.muted = true
  video.playsInline = true

  const hasWindowBounds = computed(() => windowBounds.width.value > 0 && windowBounds.height.value > 0)
  const samplingOptions = computed(() => ({
    neutralColorWeight: live2dScreenAmbientLightNeutralColorWeight.value,
  }))
  const captureFrameRate = computed(() => clamp(1000 / Math.max(1, live2dScreenAmbientLightCaptureIntervalMs.value), 1, 30))
  const {
    selectWithSource,
    checkMacOSPermission,
    requestMacOSPermission,
  } = useElectronScreenCapture(window.electron.ipcRenderer, sourcesOptions)

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

  watch(live2dScreenAmbientLightForcedColor, () => {
    if (live2dScreenAmbientLightEnabled.value && live2dScreenAmbientLightSource.value === 'forced-color')
      applyForcedColor()
  })

  watch([live2dScreenAmbientLightSampleWidth, live2dScreenAmbientLightSampleHeight], ([width, height]) => {
    canvas.width = Math.max(1, Math.round(width))
    canvas.height = Math.max(1, Math.round(height))
  }, { immediate: true })

  // The stream rate is the sample rate, so a new interval must reach the track.
  // A rejected constraint keeps the old rate, which is slower but still correct.
  watch([captureFrameRate, live2dScreenAmbientLightSampleWidth], async ([frameRate]) => {
    const track = activeStream.value?.getVideoTracks()[0]
    const display = capturedDisplay.value
    if (!track || !display)
      return

    try {
      await track.applyConstraints(captureConstraints(display.bounds, frameRate))
    }
    catch (error) {
      console.warn(`Failed to update the screen ambient light capture constraints: ${errorMessageFrom(error)}`)
    }
  })

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
      (sources) => {
        const source = sources.find(candidate => candidate.display_id === String(display.id))
          ?? sources.find(candidate => candidate.id.startsWith('screen:'))
        // An empty source list is what a missing macOS screen-recording
        // permission looks like from here. Passing an empty id on would fail
        // later inside the main process with a message that names no cause.
        if (!source)
          throw new Error('No screen-capture source is available. Check the screen-recording permission for AIRI.')
        return source.id
      },
      async () => await navigator.mediaDevices.getDisplayMedia({
        video: captureConstraints(display.bounds, captureFrameRate.value),
        audio: false,
      }),
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
    scheduleFrameSample(version)
  }

  /**
   * Width and height are maximums in the display aspect, so Chromium scales the
   * frame down without cropping it. The frame rate matches the sample interval.
   * Both were verified against Electron 43: a request for 320x180 at 5 fps
   * delivered 320x180 frames at about 6 fps, while an unconstrained request
   * delivered the full 5120x2880 display at 30 fps.
   */
  function captureConstraints(
    display: { width: number, height: number },
    frameRate: number,
  ): MediaTrackConstraints {
    const aspect = display.width / Math.max(1, display.height)
    const width = Math.min(display.width, maximumCaptureWidth, Math.round(live2dScreenAmbientLightSampleWidth.value * captureOversampling))
    return {
      width: { max: width },
      height: { max: Math.max(1, Math.round(width / aspect)) },
      frameRate: { max: frameRate },
    }
  }

  function scheduleFrameSample(version: number) {
    frameCallbackHandle = video.requestVideoFrameCallback(() => {
      if (version !== startVersion)
        return
      sample()
      scheduleFrameSample(version)
    })
  }

  function stop() {
    if (frameCallbackHandle !== 0) {
      video.cancelVideoFrameCallback(frameCallbackHandle)
      frameCallbackHandle = 0
    }
    const stream = activeStream.value
    activeStream.value = undefined
    capturedDisplay.value = undefined
    video.pause()
    video.srcObject = null
    stream?.getTracks().forEach(track => track.stop())
    paintedMask.reset()
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
    const now = performance.now()
    const excludedWindow = normalizeWindowBounds(display.bounds, currentWindowBounds())
    const result = sampleScreenAmbientLight(frame, {
      exclude: excludedWindow,
      displayAspect: display.bounds.width / Math.max(1, display.bounds.height),
      paintedAlpha: paintedMask.maskFor(excludedWindow, now),
    }, samplingOptions.value)

    const nextEnvironment = ambientLight.active
      ? smoothAmbientLightEnvironment(ambientLight.environment, result.environment, now - lastSampleTime, live2dScreenAmbientLightResponseMs.value)
      : result.environment
    lastSampleTime = now
    ambientLight.setEnvironment(nextEnvironment)

    publishDiagnostics('capturing', {
      frame: {
        width: frame.width,
        height: frame.height,
        data: frame.data.slice(),
      },
      excludedRegion: excludedWindow,
      sampling: {
        ...result.diagnostics,
        targetEnvironment: result.environment,
        appliedEnvironment: nextEnvironment,
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
    const environment = uniformAmbientLightEnvironment(sample)
    ambientLight.setEnvironment(environment)
    publishDiagnostics('forced-color', {
      sampling: {
        totalPixelCount: 0,
        excludedPixelCount: 0,
        transparentPixelCount: 0,
        acceptedPixelCount: 0,
        seeThroughPixelCount: 0,
        targetEnvironment: environment,
        appliedEnvironment: environment,
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
