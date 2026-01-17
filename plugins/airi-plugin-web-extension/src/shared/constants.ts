import type { ExtensionSettings } from './types'

export const DEFAULT_WS_URL = 'ws://localhost:6121/ws'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  wsUrl: DEFAULT_WS_URL,
  token: '',
  enabled: true,
  sendPageContext: true,
  sendVideoContext: true,
  sendSubtitles: true,
  sendSparkNotify: true,
  enableVision: false,
}

export const STORAGE_KEY = 'airi:web-extension:settings'
