import type { AnalyserBeatEvent, AnalyserWorkletParameters } from '@nekopaw/tempora'

import type { BeatSyncDetectorState } from './types'

import { defineInvokeEventa } from '@moeru/eventa'

// Functions
export const beatSyncToggleInvokeEventa = defineInvokeEventa<void, boolean>('eventa:invoke:electron:beat-sync:toggle')
export const beatSyncGetStateInvokeEventa = defineInvokeEventa<BeatSyncDetectorState>('eventa:invoke:electron:beat-sync:get-state')
export const beatSyncUpdateParametersInvokeEventa = defineInvokeEventa<void, Partial<AnalyserWorkletParameters>>('eventa:event:electron:beat-sync:update-parameters')

// Events
export const beatSyncStateChangedInvokeEventa = defineInvokeEventa<void, BeatSyncDetectorState>('eventa:event:electron:beat-sync:state-changed')
export const beatSyncBeatSignaledInvokeEventa = defineInvokeEventa<void, AnalyserBeatEvent>('eventa:event:electron:beat-sync:beat-signaled')
