import type { ExtensionSettings } from './types'

export const DEFAULT_WS_URL = 'ws://localhost:6121/ws'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  enableVision: false,
  sendPageContext: true,
  sendSparkNotify: true,
  sendSubtitles: true,
  sendVideoContext: true,
  token: '',
  wsUrl: DEFAULT_WS_URL,
}

export const STORAGE_KEY = 'airi:web-extension:settings'
