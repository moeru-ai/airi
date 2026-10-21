import type { KirieEventaContext, KirieEventaContextHandle } from '@gd-kirie/ipc-eventa'
import type { NotificationsClient } from '@gd-kirie/notifications'
import type { PlatformClient } from '@gd-kirie/platform'
import type { QrClient } from '@gd-kirie/qr'
import type { InvokeEventa } from '@moeru/eventa'
import type { ShallowRef } from 'vue'

import { createContext as createKirieContext } from '@gd-kirie/ipc-eventa'
import { createNotificationsClient } from '@gd-kirie/notifications'
import { createPlatformClient } from '@gd-kirie/platform'
import { createQrClient } from '@gd-kirie/qr'
import { defineInvoke } from '@moeru/eventa'
import { shallowRef } from 'vue'

import '@gd-kirie/ipc'

/** Owns this renderer's Eventa transport and Kirie clients. */
export interface HostContextOwner {
  context: KirieEventaContext
  notifications: NotificationsClient
  platform: PlatformClient
  qr: QrClient
}

// Adapters borrow one context per renderer. The renderer entry disposes its
// transport on page exit or hot replacement and aborts pending requests first.
let owner: (HostContextOwner & KirieEventaContextHandle) | undefined

function createHostContextOwner(): HostContextOwner & KirieEventaContextHandle {
  const eventa = createKirieContext()
  return {
    ...eventa,
    notifications: createNotificationsClient(eventa.context),
    platform: createPlatformClient(eventa.context),
    qr: createQrClient(eventa.context),
  }
}

/** Reuses this renderer's owner until the renderer entry disposes it. */
export function initializeHostContext(): HostContextOwner {
  owner ??= createHostContextOwner()
  return owner
}

export function getHostEventaContext(): KirieEventaContext {
  return initializeHostContext().context
}

export function useHostEventaContext(): ShallowRef<KirieEventaContext> {
  return shallowRef(getHostEventaContext())
}

export function useHostEventaInvoke<Res, Req = undefined, ResErr = Error, ReqErr = Error>(invoke: InvokeEventa<Res, Req, ResErr, ReqErr>, context?: KirieEventaContext) {
  return defineInvoke(context ?? getHostEventaContext(), invoke)
}

/** Aborts pending requests before transport cleanup. Repeated disposal has no effect. */
export function disposeHostContext() {
  if (!owner)
    return

  owner.context.abort(new Error('AIRI host context disposed.'))
  owner.dispose()
  owner = undefined
}
