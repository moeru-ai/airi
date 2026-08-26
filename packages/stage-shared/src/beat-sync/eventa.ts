import type { InvocableEventContext } from '@moeru/eventa'
import type { AnalyserBeatEvent, AnalyserWorkletParameters } from '@nekopaw/tempora'

import type { BeatSyncDetectorState } from './types'

import { createContext as createWebContext, defineInvokeEventa } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'
import { isElectronWindow } from '@proj-airi/stage-shared'

export type BeatSyncConsumer = 'beat-sync' | 'live2d-lipsync'

/** Serializable system-audio levels broadcast by the capture-owning renderer. */
export interface BeatSyncAudioOutput {
  inputLevel: number
  mouthOpen: number
}

/** Runtime tuning for the removable system-audio lipsync closure workaround. */
export interface BeatSyncLipSyncOptions {
  /** Minimum normalized system-audio level that can drive mouth movement. */
  inputVolumeThreshold: number
  /** Maximum sustained-open delay in milliseconds; each attempt samples from half to this value. */
  randomCloseDelayMs: number
  /** Chance from 0 to 1 that an eligible random closure runs. */
  randomCloseProbability: number
}

// Functions
export const beatSyncToggleInvokeEventa = defineInvokeEventa<void, boolean>('eventa:invoke:electron:beat-sync:toggle')
export const beatSyncSetConsumerInvokeEventa = defineInvokeEventa<void, { consumer: BeatSyncConsumer, enabled: boolean }>('eventa:invoke:electron:beat-sync:set-consumer')
export const beatSyncUpdateLipSyncOptionsInvokeEventa = defineInvokeEventa<void, BeatSyncLipSyncOptions>('eventa:invoke:electron:beat-sync:update-lipsync-options')
export const beatSyncGetStateInvokeEventa = defineInvokeEventa<BeatSyncDetectorState>('eventa:invoke:electron:beat-sync:get-state')
export const beatSyncUpdateParametersInvokeEventa = defineInvokeEventa<void, Partial<AnalyserWorkletParameters>>('eventa:event:electron:beat-sync:update-parameters')
export const beatSyncGetInputByteFrequencyDataInvokeEventa = defineInvokeEventa<Uint8Array<ArrayBuffer>>('eventa:invoke:electron:beat-sync:get-input-byte-frequency-data')

// Events
export const beatSyncStateChangedInvokeEventa = defineInvokeEventa<void, BeatSyncDetectorState>('eventa:event:electron:beat-sync:state-changed')
export const beatSyncBeatSignaledInvokeEventa = defineInvokeEventa<void, AnalyserBeatEvent>('eventa:event:electron:beat-sync:beat-signaled')
export const beatSyncAudioOutputSignaledInvokeEventa = defineInvokeEventa<void, BeatSyncAudioOutput>('eventa:event:electron:beat-sync:audio-output-signaled')

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

export function createContext(): InvocableEventContext<any, { raw?: any }> {
  if (isElectronWindow(window)) {
    return createBroadcastChannelContext(getBroadcastChannel()).context as InvocableEventContext<any, { raw?: any }>
  }
  else {
    return createWebContext()
  }
}
