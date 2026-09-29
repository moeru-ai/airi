import type { PluginListenerHandle } from '@capacitor/core'

import { registerPlugin } from '@capacitor/core'

/** Each entry is one enabled pronunciation from a character card. */
export interface BackgroundWakeKeyword {
  characterId: string
  tokens: string[]
  score?: number
  threshold?: number
}

export interface PendingBackgroundWake {
  characterId?: string
  tokens?: string[]
}

interface BackgroundWakeWordPlugin {
  /** Starts or updates the Android microphone service while Pocket is visible. */
  start: (options: { keywords: BackgroundWakeKeyword[] }) => Promise<void>
  /** Stops background detection and releases the native microphone. */
  stop: () => Promise<void>
  /** Returns and clears one background match after the user opens Pocket. */
  takePendingWake: () => Promise<PendingBackgroundWake>
  /** Fires when the user taps the wake word notification while Pocket is already open. */
  addListener: (eventName: 'wakeNotificationTapped', listener: () => void) => Promise<PluginListenerHandle>
}

export const BackgroundWakeWord = registerPlugin<BackgroundWakeWordPlugin>('BackgroundWakeWord')
