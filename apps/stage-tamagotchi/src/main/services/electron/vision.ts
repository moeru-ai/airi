import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { desktopCapturer } from 'electron'

import {
  visionCaptureScreen,
  visionGetConfig,
  visionScreenChangeEvent,
  visionSetAutoCapture,
  visionUpdateConfig,
} from '../../../shared/vision'

const VISION_ERRORS = {
  COOLDOWN_ACTIVE: 'cooldown_active',
  NO_SOURCES: 'no_sources',
} as const

const MIN_AUTO_CAPTURE_INTERVAL = 5000

interface VisionConfig {
  autoCapture: {
    enabled: boolean
    interval: number
  }
  cooldown: number
  modelProvider: string
  modelName: string
}

const DEFAULT_CONFIG: VisionConfig = {
  autoCapture: {
    enabled: false,
    interval: 30000,
  },
  cooldown: 5000,
  modelProvider: 'openai',
  modelName: 'gpt-4o',
}

async function getScreenSources() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  })
  return sources
}

export function createVisionService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const { context, window } = params

  const config: VisionConfig = { ...DEFAULT_CONFIG }
  let lastCaptureTime = 0
  let autoCaptureInterval: ReturnType<typeof setInterval> | null = null

  function checkCooldown(): boolean {
    const now = Date.now()
    return now - lastCaptureTime >= config.cooldown
  }

  function startAutoCapture() {
    stopAutoCapture()

    autoCaptureInterval = setInterval(() => {
      captureAndEmit()
    }, config.autoCapture.interval)
  }

  function stopAutoCapture() {
    if (autoCaptureInterval) {
      clearInterval(autoCaptureInterval)
      autoCaptureInterval = null
    }
  }

  async function captureAndEmit() {
    if (!checkCooldown()) {
      return
    }

    lastCaptureTime = Date.now()

    try {
      const sources = await getScreenSources()

      if (sources.length === 0) {
        return
      }

      const primarySource = sources[0]
      const thumbnail = primarySource.thumbnail.toPNG().toString('base64')

      context.emit(visionScreenChangeEvent, { timestamp: lastCaptureTime })
      window.webContents.send('vision:screenshot', {
        image: thumbnail,
        timestamp: lastCaptureTime,
      })
    }
    catch (error) {
      console.error('[Vision] Auto capture error:', error)
    }
  }

  defineInvokeHandler(context, visionCaptureScreen, async () => {
    if (!checkCooldown()) {
      return { error: VISION_ERRORS.COOLDOWN_ACTIVE, timestamp: Date.now() }
    }

    lastCaptureTime = Date.now()

    const sources = await getScreenSources()

    if (sources.length === 0) {
      return { error: VISION_ERRORS.NO_SOURCES, timestamp: Date.now() }
    }

    const primarySource = sources[0]
    const thumbnail = primarySource.thumbnail.toPNG().toString('base64')

    return {
      image: thumbnail,
      timestamp: lastCaptureTime,
    }
  })

  defineInvokeHandler(context, visionSetAutoCapture, async (payload) => {
    const enabled = payload?.enabled ?? false
    const interval = payload?.interval
    if (enabled) {
      config.autoCapture.enabled = true
      if (interval) {
        config.autoCapture.interval = Math.max(interval, MIN_AUTO_CAPTURE_INTERVAL)
      }
      startAutoCapture()
    }
    else {
      config.autoCapture.enabled = false
      stopAutoCapture()
    }
  })

  defineInvokeHandler(context, visionGetConfig, async () => {
    return {
      cooldown: config.cooldown,
      autoCapture: { ...config.autoCapture },
    }
  })

  defineInvokeHandler(context, visionUpdateConfig, async (payload) => {
    if (payload?.cooldown !== undefined) {
      config.cooldown = payload.cooldown
    }
    if (payload?.autoCapture?.enabled !== undefined) {
      config.autoCapture.enabled = payload.autoCapture.enabled
    }
    if (payload?.autoCapture?.interval !== undefined) {
      config.autoCapture.interval = Math.max(payload.autoCapture.interval, MIN_AUTO_CAPTURE_INTERVAL)
      if (config.autoCapture.enabled) {
        startAutoCapture()
      }
    }
  })
}
