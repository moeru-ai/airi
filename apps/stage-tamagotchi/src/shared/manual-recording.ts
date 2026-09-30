import { defineEventa } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'

export const manualRecordingChannelName = 'airi-chat-manual-recording'
export const manualRecordingHeartbeatMs = 1000
export const manualRecordingLeaseMs = 5000

export interface ManualRecordingState {
  sourceId: string
  active: boolean
}

/** Carries manual recording state from chat renderers to the main renderer. */
export const manualRecordingStateChanged = defineEventa<ManualRecordingState>('eventa:chat:manual-recording:state-changed')

/** Tracks live chat renderers until their recording heartbeat expires. */
export class ManualRecordingLeaseTracker {
  private readonly sources = new Map<string, number>()

  apply(state: ManualRecordingState, now = Date.now()) {
    if (state.active)
      this.sources.set(state.sourceId, now + manualRecordingLeaseMs)
    else
      this.sources.delete(state.sourceId)
    this.expire(now)
  }

  expire(now = Date.now()) {
    for (const [sourceId, deadline] of this.sources) {
      if (deadline <= now)
        this.sources.delete(sourceId)
    }
  }

  get active() {
    return this.sources.size > 0
  }
}

/** Opens an Eventa channel for manual recording state between windows. */
export function createManualRecordingChannel() {
  return createBroadcastChannelContext(new BroadcastChannel(manualRecordingChannelName), { closeOnDispose: true })
}
