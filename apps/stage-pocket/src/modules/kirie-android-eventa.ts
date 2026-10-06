import type { DirectionalEventa, Eventa } from '@moeru/eventa'

import {
  and,
  createContext,
  defineInboundEventa,
  defineOutboundEventa,
  EventaFlowDirection,
  matchBy,
  nanoid,
} from '@moeru/eventa'

interface AndroidEventaChannel {
  onmessage: ((event: MessageEvent<string>) => void) | null
  postMessage: (message: string) => void
}

interface AndroidEventaMessage {
  id: string
  payload: Record<string, unknown>
  type: string
}

declare global {
  interface Window {
    AiriAndroidEventa?: AndroidEventaChannel
  }
}

export const isKirieAndroid = import.meta.env.MODE === 'kirie-android'

let contextHandle: ReturnType<typeof createAndroidEventaContext> | undefined

function createMessage(event: Eventa) {
  return {
    id: nanoid(),
    payload: {
      ...defineOutboundEventa(event.type),
      ...event,
    },
    type: event.id,
  }
}

function createAndroidEventaContext() {
  const channel = window.AiriAndroidEventa
  if (!channel)
    throw new Error('The AIRI Android Eventa channel is unavailable.')

  const context = createContext()
  const offOutbound = context.on(
    and(
      matchBy((event) => {
        const direction = (event as Partial<DirectionalEventa<unknown>>)._flowDirection
        return direction === EventaFlowDirection.Outbound || !direction
      }),
      matchBy('*'),
    ),
    event => channel.postMessage(JSON.stringify(createMessage(event))),
  )
  const onMessage = (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as AndroidEventaMessage
    context.emit(
      defineInboundEventa(message.type),
      message.payload.body,
      { raw: { message: event.data } },
    )
  }
  channel.onmessage = onMessage

  return {
    context,
    dispose: () => {
      offOutbound()
      if (channel.onmessage === onMessage)
        channel.onmessage = null
    },
  }
}

export function getKirieAndroidEventaContext() {
  contextHandle ??= createAndroidEventaContext()
  return contextHandle.context
}

window.addEventListener('pagehide', () => {
  contextHandle?.dispose()
  contextHandle = undefined
}, { once: true })
