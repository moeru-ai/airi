import type { DirectionalEventa, Eventa } from '@moeru/eventa'

import {
  and,
  createContext,
  defineInboundEventa,
  defineInvoke,
  defineInvokeEventa,
  defineOutboundEventa,
  EventaFlowDirection,
  matchBy,
  nanoid,
} from '@moeru/eventa'

export type KirieAndroidPermission = 'microphone' | 'notifications'

interface PermissionPayload {
  permission: KirieAndroidPermission
}

interface PermissionState {
  granted: boolean
}

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

const checkPermissionEvent = defineInvokeEventa<PermissionState, PermissionPayload>(
  'eventa:invoke:airi:android:permission:check',
)
const requestPermissionEvent = defineInvokeEventa<PermissionState, PermissionPayload>(
  'eventa:invoke:airi:android:permission:request',
)
const openPermissionSettingsEvent = defineInvokeEventa<void, PermissionPayload>(
  'eventa:invoke:airi:android:permission:open-settings',
)

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

function getContextHandle() {
  contextHandle ??= createAndroidEventaContext()
  return contextHandle
}

export async function checkKirieAndroidPermission(permission: KirieAndroidPermission) {
  const handle = getContextHandle()
  return await defineInvoke(handle.context, checkPermissionEvent)({ permission })
}

export async function requestKirieAndroidPermission(permission: KirieAndroidPermission) {
  const handle = getContextHandle()
  return await defineInvoke(handle.context, requestPermissionEvent)({ permission })
}

export async function openKirieAndroidPermissionSettings(permission: KirieAndroidPermission) {
  const handle = getContextHandle()
  await defineInvoke(handle.context, openPermissionSettingsEvent)({ permission })
}

window.addEventListener('pagehide', () => {
  contextHandle?.dispose()
  contextHandle = undefined
}, { once: true })
