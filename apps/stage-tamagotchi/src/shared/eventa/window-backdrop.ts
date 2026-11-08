import type { BackdropRegion } from '@proj-airi/electron-native-backdrop/types'

import { defineInvokeEventa } from '@moeru/eventa'

/** The renderer keeps its readable CSS surface until native composition succeeds. */
export type WindowBackdropStatus
  = | { state: 'active' }
    | { state: 'unsupported' | 'failed', reason: string }

/**
 * Replaces the requesting window's material regions. An empty list removes all regions.
 * Rectangles use viewport CSS pixels; main converts them to native content points at the current page zoom.
 * The main-owned window handle never crosses IPC. IDs retain native layers across geometry updates.
 */
export const electronWindowBackdropUpdate = defineInvokeEventa<WindowBackdropStatus, { regions: BackdropRegion[] }>('eventa:invoke:electron:window:backdrop:update')
