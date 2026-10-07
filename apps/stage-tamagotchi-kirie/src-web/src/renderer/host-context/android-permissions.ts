import type {
  AiriAndroidPermission,
  AiriAndroidPermissionSnapshot,
} from '../../shared/eventa'

import {
  airiAndroidPermissionEventIds,
} from '../../shared/eventa'

interface AndroidEventaChannel {
  onmessage: ((event: MessageEvent<string>) => void) | null
  postMessage: (message: string) => void
}

interface AndroidEventaResponse {
  payload?: {
    body?: {
      content?: unknown
      invokeId?: string
    }
  }
  type?: string
}

interface PendingRequest {
  reject: (error: Error) => void
  resolve: (content: unknown) => void
}

declare global {
  interface Window {
    AiriAndroidEventa?: AndroidEventaChannel
  }
}

const pendingRequests = new Map<string, PendingRequest>()
let activeChannel: AndroidEventaChannel | undefined

function handleAndroidEventaMessage(event: MessageEvent<string>) {
  const response = JSON.parse(event.data) as AndroidEventaResponse
  const invokeId = response.payload?.body?.invokeId
  if (!invokeId)
    return

  const pending = pendingRequests.get(invokeId)
  if (!pending)
    return

  pendingRequests.delete(invokeId)
  const content = response.payload?.body?.content
  if (response.type?.includes('-receive-error-')) {
    pending.reject(new Error(String((content as { error?: unknown } | undefined)?.error ?? 'Android bridge request failed')))
    return
  }

  pending.resolve(content)
}

function getAndroidEventaChannel() {
  const channel = window.AiriAndroidEventa
  if (!channel)
    throw new Error('Kirie Android Eventa channel is unavailable')

  if (activeChannel !== channel) {
    channel.onmessage = handleAndroidEventaMessage
    activeChannel = channel
  }
  return channel
}

export function invokeAndroidEventa<Response>(eventId: string, content: unknown): Promise<Response> {
  const channel = getAndroidEventaChannel()
  const invokeId = crypto.randomUUID()
  return new Promise<Response>((resolve, reject) => {
    pendingRequests.set(invokeId, {
      reject,
      resolve: value => resolve(value as Response),
    })
    channel.postMessage(JSON.stringify({
      payload: {
        body: { content, invokeId },
        id: `${eventId}-send`,
      },
    }))
  })
}

export interface HostAndroidPermissions {
  check: (permission: AiriAndroidPermission) => Promise<AiriAndroidPermissionSnapshot>
  openSettings: (permission: AiriAndroidPermission) => Promise<void>
  request: (permission: AiriAndroidPermission) => Promise<AiriAndroidPermissionSnapshot>
}

/** Connects the universal renderer to Kirie's Android permission bridge. */
export function useHostAndroidPermissions(): HostAndroidPermissions {
  return {
    async check(permission) {
      return await invokeAndroidEventa<AiriAndroidPermissionSnapshot>(airiAndroidPermissionEventIds.check, { permission })
    },
    async openSettings(permission) {
      await invokeAndroidEventa<void>(airiAndroidPermissionEventIds.openSettings, { permission })
    },
    async request(permission) {
      return await invokeAndroidEventa<AiriAndroidPermissionSnapshot>(airiAndroidPermissionEventIds.request, { permission })
    },
  }
}
