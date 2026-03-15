import { defineEventa } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'

export interface SpeechIntentStartPayload {
  originId: string
  intentId: string
  streamId: string
  ownerId?: string
  priority?: number
  behavior?: 'queue' | 'interrupt' | 'replace'
}

export interface SpeechIntentTokenPayload {
  originId: string
  intentId: string
  streamId: string
  sequence: number
  value?: string
}

export interface SpeechIntentEndPayload {
  originId: string
  intentId: string
  streamId: string
}

export interface SpeechIntentCancelPayload {
  originId: string
  intentId: string
  streamId: string
  reason?: string
}

export const speechIntentStartEvent = defineEventa<SpeechIntentStartPayload>('eventa:audio:speech:intent:start')
export const speechIntentLiteralEvent = defineEventa<SpeechIntentTokenPayload>('eventa:audio:speech:intent:literal')
export const speechIntentSpecialEvent = defineEventa<SpeechIntentTokenPayload>('eventa:audio:speech:intent:special')
export const speechIntentFlushEvent = defineEventa<SpeechIntentTokenPayload>('eventa:audio:speech:intent:flush')
export const speechIntentEndEvent = defineEventa<SpeechIntentEndPayload>('eventa:audio:speech:intent:end')
export const speechIntentCancelEvent = defineEventa<SpeechIntentCancelPayload>('eventa:audio:speech:intent:cancel')

const BUS_CHANNEL_NAME = 'proj-airi:pipelines:outputs:speech'

let context: ReturnType<typeof createBroadcastChannelContext>['context'] | undefined
let channel: BroadcastChannel | undefined

function getChannel() {
  if (!channel)
    channel = new BroadcastChannel(BUS_CHANNEL_NAME)
  return channel
}

export function getSpeechBusContext() {
  if (!context)
    context = createBroadcastChannelContext(getChannel()).context
  return context
}
