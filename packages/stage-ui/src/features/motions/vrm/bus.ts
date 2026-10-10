import type { MotionCommand } from './command'

import { defineEventa } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/broadcast-channel'

export type { MotionCommand } from './command'

export const motionCommand = defineEventa<MotionCommand>('airi:vrm-motion:command')
export const motionLibraryChanged = defineEventa('airi:vrm-motion:library-changed')
export const motionPreferencesChanged = defineEventa<{ modelId: string }>('airi:vrm-motion:preferences-changed')
export const motionCommandResult = defineEventa<{ modelId: string, requestId: string, accepted: boolean }>('airi:vrm-motion:command-result')

let context: ReturnType<typeof createContext>['context'] | undefined

/** Reuses one Eventa transport per renderer. No animation bytes cross this channel. */
export function getMotionBus() {
  if (!context)
    context = createContext(new BroadcastChannel('proj-airi:vrm-motions')).context
  return context
}
