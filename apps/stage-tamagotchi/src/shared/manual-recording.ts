import { defineEventa } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'

export const manualRecordingChannelName = 'airi-chat-manual-recording'
/** Carries manual recording state from chat renderers to the main renderer. */
export const manualRecordingStateChanged = defineEventa<{ sourceId: string, active: boolean }>('eventa:chat:manual-recording:state-changed')

/** Opens an Eventa channel for manual recording state between windows. */
export function createManualRecordingChannel() {
  return createBroadcastChannelContext(new BroadcastChannel(manualRecordingChannelName), { closeOnDispose: true })
}
