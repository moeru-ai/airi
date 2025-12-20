import type { AnalyserBeatEvent, AnalyserWorkletParameters } from '@nekopaw/tempora'

import type { BeatSyncDetectorState } from './types'

import { createContext as createWebContext, defineInvokeEventa } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'
import { isElectronWindow } from '@proj-airi/stage-shared'

// Functions
export const beatSyncToggleInvokeEventa = defineInvokeEventa<void, boolean>('eventa:invoke:electron:beat-sync:toggle')
export const beatSyncGetStateInvokeEventa = defineInvokeEventa<BeatSyncDetectorState>('eventa:invoke:electron:beat-sync:get-state')
export const beatSyncUpdateParametersInvokeEventa = defineInvokeEventa<void, Partial<AnalyserWorkletParameters>>('eventa:event:electron:beat-sync:update-parameters')
export const beatSyncGetInputByteFrequencyDataInvokeEventa = defineInvokeEventa<Uint8Array<ArrayBuffer>>('eventa:invoke:electron:beat-sync:get-input-byte-frequency-data')

// Events
export const beatSyncStateChangedInvokeEventa = defineInvokeEventa<void, BeatSyncDetectorState>('eventa:event:electron:beat-sync:state-changed')
export const beatSyncBeatSignaledInvokeEventa = defineInvokeEventa<void, AnalyserBeatEvent>('eventa:event:electron:beat-sync:beat-signaled')

let _broadcastChannel: BroadcastChannel | undefined
function getBroadcastChannel() {
  if (!_broadcastChannel) {
    _broadcastChannel = new BroadcastChannel('airi::beat-sync')
    _broadcastChannel.onmessage = () => {
      // TODO: do we need to handle this?
      // REVIEW(nekomeowww): do we need to handle this?
    }
  }
  return _broadcastChannel
}

export function createContext() {
  if (isElectronWindow(window)) {
    return createBroadcastChannelContext(getBroadcastChannel()).context
  }
  else {
    return createWebContext()
  }
}
