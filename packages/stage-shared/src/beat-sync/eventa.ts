import type { AnalyserBeatEvent } from '@nekopaw/tempora'

import { defineInvokeEventa } from '@moeru/eventa'

export const beatSyncToggle = defineInvokeEventa<void, boolean>('eventa:event:electron:beat-sync:toggle')
export const beatSyncRequestSignalBeat = defineInvokeEventa<void, AnalyserBeatEvent>('eventa:event:electron:beat-sync:request-signal-beat')
export const beatSyncSignalBeat = defineInvokeEventa<void, AnalyserBeatEvent>('eventa:event:electron:beat-sync:signal-beat')
