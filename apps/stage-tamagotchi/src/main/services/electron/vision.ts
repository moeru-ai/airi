import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { desktopCapturer } from 'electron'

import {
  visionAnalyzeScreen,
  visionCaptureScreen,
  visionExecuteAction,
  visionGetConfig,
  visionScreenChangeEvent,
  visionSetAutoCapture,
  visionUpdateConfig,
} from '../../../shared/vision'

interface VisionConfig {
  autoCapture: {
    enabled: boolean
    interval: number
  }
  cooldown: number
  modelProvider: string
  modelName: string
}

const config: VisionConfig = {
  autoCapture: {
    enabled: false,
    interval: 30000,
  },
  cooldown: 5000,
  modelProvider: 'openai',
  modelName: 'gpt-4o',
}

let lastCaptureTime = 0
let autoCaptureInterval: ReturnType<typeof setInterval> | null = null
let savedContext: ReturnType<typeof createContext>['context'] | null = null
let savedWindow: BrowserWindow | null = null

export function createVisionService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  const { context, window } = params
  savedContext = context
  savedWindow = window

  defineInvokeHandler(context, visionCaptureScreen, async () => {
    const now = Date.now()
    if (now - lastCaptureTime < config.cooldown) {
      throw new Error('Cooldown active, please wait before capturing again')
    }

    lastCaptureTime = now

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })

    if (sources.length === 0) {
      throw new Error('No screen sources available')
    }

    const primarySource = sources[0]
    const thumbnail = primarySource.thumbnail.toPNG().toString('base64')

    return {
      image: thumbnail,
      timestamp: now,
    }
  })

  defineInvokeHandler(context, visionAnalyzeScreen, async (payload) => {
    const image = payload?.image ?? ''
    const prompt = payload?.prompt
    console.info('[Vision] Analyze screen:', { imageLength: image.length, prompt })
    return {
      description: 'Screen analysis placeholder - AI integration required',
      elements: [],
      suggestions: [],
    }
  })

  defineInvokeHandler(context, visionExecuteAction, async (payload) => {
    const action = payload?.action ?? ''
    const target = payload?.target
    const coordinates = payload?.coordinates

    console.info('[Vision] Execute action:', { action, target, coordinates })
  })

  defineInvokeHandler(context, visionSetAutoCapture, async (payload) => {
    const enabled = payload?.enabled ?? false
    const interval = payload?.interval
    if (enabled) {
      config.autoCapture.enabled = true
      if (interval) {
        config.autoCapture.interval = interval
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
      config.autoCapture.interval = payload.autoCapture.interval
      if (config.autoCapture.enabled) {
        startAutoCapture()
      }
    }
  })
}

async function captureAndEmit() {
  const now = Date.now()
  if (!savedContext || !savedWindow)
    return
  if (now - lastCaptureTime < config.cooldown) {
    return
  }

  lastCaptureTime = now

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    })

    if (sources.length === 0) {
      return
    }

    const primarySource = sources[0]
    const thumbnail = primarySource.thumbnail.toPNG().toString('base64')

    savedContext.emit(visionScreenChangeEvent, { timestamp: now })
    savedWindow.webContents.send('vision:screenshot', {
      image: thumbnail,
      timestamp: now,
    })
  }
  catch (error) {
    console.error('[Vision] Auto capture error:', error)
  }
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
