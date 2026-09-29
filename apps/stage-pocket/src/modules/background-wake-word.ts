import type { PluginListenerHandle } from '@capacitor/core'

import { Capacitor, registerPlugin } from '@capacitor/core'

/** Each entry is one enabled pronunciation from a character card. */
export interface BackgroundWakeKeyword {
  characterId: string
  tokens: string[]
  score?: number
  threshold?: number
}

export interface PendingBackgroundWake {
  id?: string
  characterId?: string
  tapped?: boolean
}

/** Notification labels come from the shared locale selected by Pocket. */
export interface BackgroundWakeNotificationText {
  listeningChannel: string
  matchChannel: string
  listeningTitle: string
  listeningBody: string
  matchTitle: string
  matchBody: string
  errorTitle: string
  errorBody: string
}

interface BackgroundWakeWordPlugin {
  /** Starts or updates the Android microphone service while Pocket is visible. */
  start: (options: { keywords: BackgroundWakeKeyword[], notificationText: BackgroundWakeNotificationText }) => Promise<void>
  /** Stops background detection and releases the native microphone. */
  stop: () => Promise<void>
  /** Reads a pending match without consuming it. A successful foreground arm confirms its ID. */
  peekPendingWake: () => Promise<PendingBackgroundWake>
  acknowledgeWake: (options: { id: string, consumed: boolean }) => Promise<void>
  /** Resolves after native capture releases its microphone when active is true. */
  setForegroundCapture: (options: { active: boolean }) => Promise<void>
  /** Fires when the user taps the wake word notification while Pocket is already open. */
  addListener: (eventName: 'wakeNotificationTapped', listener: () => void) => Promise<PluginListenerHandle>
}

export const BackgroundWakeWord = registerPlugin<BackgroundWakeWordPlugin>('BackgroundWakeWord')

/** Optional Pocket host hooks. Other platforms keep the foreground runtime unchanged. */
export const backgroundCaptureHandoff = {
  async beforeResume() {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')
      await BackgroundWakeWord.setForegroundCapture({ active: true })
  },
  async afterPause() {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')
      await BackgroundWakeWord.setForegroundCapture({ active: false })
  },
}
